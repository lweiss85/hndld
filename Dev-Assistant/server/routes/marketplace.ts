import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  providerProfiles, serviceProviders, marketplaceReviews, bookingRequests,
  bookingMessages,
  type ProviderProfile, type MarketplaceReview,
} from "@shared/schema";
import { eq, and, sql, desc, asc, gte, lte, ilike, or, count } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import logger from "../lib/logger";
import { z } from "zod";

function getUserId(req: Request): string | null {
  return (req as any).user?.id || (req as any).userId || null;
}

function getHouseholdId(req: Request): string | null {
  return (req as any).householdId || req.headers["x-household-id"] as string || null;
}

function isZodError(err: unknown): err is z.ZodError {
  return err instanceof z.ZodError || (err !== null && typeof err === "object" && (err as any).name === "ZodError");
}

type Badge = "VERIFIED" | "TOP_RATED" | "FAST_RESPONDER" | "RELIABLE" | "VETERAN" | "NEIGHBOR_FAVORITE";

function computeBadges(
  profile: ProviderProfile,
  provider: { averageRating: string | null; totalReviews: number | null; createdAt: Date },
): Badge[] {
  const badges: Badge[] = [];

  if (profile.verificationStatus === "VERIFIED" || profile.verificationStatus === "PREMIUM") {
    badges.push("VERIFIED");
  }

  const avgRating = provider.averageRating ? parseFloat(provider.averageRating) : 0;
  const totalReviews = provider.totalReviews ?? 0;

  if (avgRating >= 4.5 && totalReviews >= 5) {
    badges.push("TOP_RATED");
  }

  if (profile.responseTimeMinutes != null && profile.responseTimeMinutes <= 60) {
    badges.push("FAST_RESPONDER");
  }

  const completionRate = profile.completionRate ? parseFloat(profile.completionRate) : 0;
  if (completionRate >= 95) {
    badges.push("RELIABLE");
  }

  const accountAgeDays = (Date.now() - new Date(provider.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (accountAgeDays >= 365 && totalReviews >= 10) {
    badges.push("VETERAN");
  }

  if (totalReviews >= 20 && avgRating >= 4.0) {
    badges.push("NEIGHBOR_FAVORITE");
  }

  return badges;
}

export function registerMarketplaceRoutes(parent: Router) {
  const router = Router();
  parent.use("/marketplace", router);

  router.get("/providers", async (req: Request, res: Response) => {
    try {
      const {
        category, location, radius, availability, minRating,
        verified, sortBy, page, limit: limitParam,
      } = req.query;

      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(limitParam as string) || 20));
      const offset = (pageNum - 1) * pageSize;

      const conditions: ReturnType<typeof eq>[] = [
        eq(providerProfiles.isPublic, true),
        eq(providerProfiles.isAcceptingClients, true),
      ];

      if (category) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${providerProfiles.servicesOffered}) AS svc
            WHERE svc->>'category' ILIKE ${'%' + (category as string) + '%'}
          )` as any
        );
      }

      if (location) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${providerProfiles.serviceAreas}) AS area
            WHERE area->>'city' ILIKE ${'%' + (location as string) + '%'}
              OR area->>'postalCode' = ${location as string}
              OR area->>'state' ILIKE ${'%' + (location as string) + '%'}
          )` as any
        );
      }

      if (verified === "true") {
        conditions.push(
          sql`${providerProfiles.verificationStatus} IN ('VERIFIED', 'PREMIUM')` as any
        );
      }

      if (minRating) {
        const minR = parseFloat(minRating as string);
        if (minR >= 1 && minR <= 5) {
          conditions.push(
            sql`CAST(${serviceProviders.averageRating} AS numeric) >= ${minR}` as any
          );
        }
      }

      if (availability) {
        const avail = availability as string;
        if (avail === "sameDay") {
          conditions.push(
            sql`(${providerProfiles.availability}->>'sameDay')::boolean = true` as any
          );
        } else if (avail === "weekend") {
          conditions.push(
            sql`(${providerProfiles.availability}->>'weekends')::boolean = true` as any
          );
        } else if (avail === "evening") {
          conditions.push(
            sql`(${providerProfiles.availability}->>'evenings')::boolean = true` as any
          );
        }
      }

      let orderClause;
      switch (sortBy) {
        case "rating":
          orderClause = desc(serviceProviders.averageRating);
          break;
        case "reviews":
          orderClause = desc(serviceProviders.totalReviews);
          break;
        case "newest":
          orderClause = desc(providerProfiles.createdAt);
          break;
        default:
          orderClause = desc(serviceProviders.averageRating);
      }

      const now = new Date();
      const featuredProviders = await db
        .select({
          profile: providerProfiles,
          provider: serviceProviders,
        })
        .from(providerProfiles)
        .innerJoin(serviceProviders, eq(providerProfiles.providerId, serviceProviders.id))
        .where(
          and(
            eq(providerProfiles.isPublic, true),
            eq(providerProfiles.isAcceptingClients, true),
            gte(providerProfiles.featuredUntil, now),
          )
        )
        .orderBy(desc(serviceProviders.averageRating))
        .limit(5);

      const results = await db
        .select({
          profile: providerProfiles,
          provider: serviceProviders,
        })
        .from(providerProfiles)
        .innerJoin(serviceProviders, eq(providerProfiles.providerId, serviceProviders.id))
        .where(and(...conditions))
        .orderBy(orderClause)
        .limit(pageSize)
        .offset(offset);

      const [countResult] = await db
        .select({ total: sql<number>`count(*)` })
        .from(providerProfiles)
        .innerJoin(serviceProviders, eq(providerProfiles.providerId, serviceProviders.id))
        .where(and(...conditions));

      const total = Number(countResult?.total ?? 0);

      const providers = results.map(r => ({
        slug: r.profile.slug,
        displayName: r.profile.displayName,
        tagline: r.profile.tagline,
        profilePhotoUrl: r.profile.profilePhotoUrl,
        verificationStatus: r.profile.verificationStatus,
        servicesOffered: r.profile.servicesOffered,
        serviceAreas: r.profile.serviceAreas,
        averageRating: r.provider.averageRating ? parseFloat(r.provider.averageRating) : null,
        totalReviews: r.provider.totalReviews ?? 0,
        responseTimeMinutes: r.profile.responseTimeMinutes,
        badges: computeBadges(r.profile, r.provider),
      }));

      const featured = featuredProviders.map(r => ({
        slug: r.profile.slug,
        displayName: r.profile.displayName,
        tagline: r.profile.tagline,
        profilePhotoUrl: r.profile.profilePhotoUrl,
        verificationStatus: r.profile.verificationStatus,
        servicesOffered: r.profile.servicesOffered,
        serviceAreas: r.profile.serviceAreas,
        averageRating: r.provider.averageRating ? parseFloat(r.provider.averageRating) : null,
        totalReviews: r.provider.totalReviews ?? 0,
        responseTimeMinutes: r.profile.responseTimeMinutes,
        badges: computeBadges(r.profile, r.provider),
        isFeatured: true,
        sponsoredLabel: "Sponsored",
      }));

      res.json({
        providers,
        featured,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (err: unknown) {
      logger.error("Marketplace provider search failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "Failed to search providers" });
    }
  });

  router.get("/providers/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;

      const [result] = await db
        .select({
          profile: providerProfiles,
          provider: serviceProviders,
        })
        .from(providerProfiles)
        .innerJoin(serviceProviders, eq(providerProfiles.providerId, serviceProviders.id))
        .where(eq(providerProfiles.slug, slug));

      if (!result) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const reviews = await db
        .select()
        .from(marketplaceReviews)
        .where(
          and(
            eq(marketplaceReviews.providerId, result.provider.id),
            eq(marketplaceReviews.isPublic, true),
          )
        )
        .orderBy(desc(marketplaceReviews.createdAt))
        .limit(10);

      const [reviewStats] = await db
        .select({
          avgOverall: sql<number>`coalesce(avg(${marketplaceReviews.overallRating}), 0)`,
          avgQuality: sql<number>`coalesce(avg(${marketplaceReviews.qualityRating}), 0)`,
          avgPunctuality: sql<number>`coalesce(avg(${marketplaceReviews.punctualityRating}), 0)`,
          avgValue: sql<number>`coalesce(avg(${marketplaceReviews.valueRating}), 0)`,
          total: sql<number>`count(*)`,
        })
        .from(marketplaceReviews)
        .where(
          and(
            eq(marketplaceReviews.providerId, result.provider.id),
            eq(marketplaceReviews.isPublic, true),
          )
        );

      const badges = computeBadges(result.profile, result.provider);

      res.json({
        profile: {
          slug: result.profile.slug,
          displayName: result.profile.displayName,
          tagline: result.profile.tagline,
          description: result.profile.description,
          profilePhotoUrl: result.profile.profilePhotoUrl,
          coverPhotoUrl: result.profile.coverPhotoUrl,
          galleryPhotos: result.profile.galleryPhotos,
          verificationStatus: result.profile.verificationStatus,
          isAcceptingClients: result.profile.isAcceptingClients,
          responseTimeMinutes: result.profile.responseTimeMinutes,
          completionRate: result.profile.completionRate ? parseFloat(result.profile.completionRate) : null,
          createdAt: result.profile.createdAt,
        },
        services: result.profile.servicesOffered ?? [],
        serviceAreas: result.profile.serviceAreas ?? [],
        availability: result.profile.availability ?? {},
        stats: {
          averageRating: result.provider.averageRating ? parseFloat(result.provider.averageRating) : null,
          totalReviews: result.provider.totalReviews ?? 0,
          totalClients: result.provider.totalClients ?? 0,
          reviewBreakdown: {
            overall: Number(reviewStats?.avgOverall ?? 0),
            quality: Number(reviewStats?.avgQuality ?? 0),
            punctuality: Number(reviewStats?.avgPunctuality ?? 0),
            value: Number(reviewStats?.avgValue ?? 0),
          },
        },
        badges,
        reviews: reviews.map(r => ({
          id: r.id,
          overallRating: r.overallRating,
          qualityRating: r.qualityRating,
          punctualityRating: r.punctualityRating,
          valueRating: r.valueRating,
          reviewText: r.reviewText,
          providerResponse: r.providerResponse,
          providerRespondedAt: r.providerRespondedAt,
          isVerified: r.isVerified,
          helpfulCount: r.helpfulCount,
          createdAt: r.createdAt,
        })),
        provider: {
          id: result.provider.id,
          businessName: result.provider.businessName,
          type: result.provider.type,
          city: result.provider.city,
          state: result.provider.state,
          isVerified: result.provider.isVerified,
        },
      });
    } catch (err: unknown) {
      logger.error("Marketplace provider detail failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "Failed to fetch provider details" });
    }
  });

  router.post("/reviews", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const schema = z.object({
        providerId: z.string().min(1),
        bookingRequestId: z.string().min(1).optional(),
        overallRating: z.number().int().min(1).max(5),
        qualityRating: z.number().int().min(1).max(5).optional(),
        punctualityRating: z.number().int().min(1).max(5).optional(),
        valueRating: z.number().int().min(1).max(5).optional(),
        reviewText: z.string().max(2000).optional(),
      });

      const data = schema.parse(req.body);

      let isVerified = false;

      if (data.bookingRequestId) {
        const [booking] = await db.select().from(bookingRequests)
          .where(and(
            eq(bookingRequests.id, data.bookingRequestId),
            eq(bookingRequests.consumerId, userId),
            eq(bookingRequests.providerId, data.providerId),
            eq(bookingRequests.status, "COMPLETED"),
          ));

        if (!booking) {
          return res.status(403).json({
            error: "Review can only be submitted for completed bookings you initiated",
          });
        }

        const [existingReview] = await db.select({ id: marketplaceReviews.id })
          .from(marketplaceReviews)
          .where(and(
            eq(marketplaceReviews.bookingRequestId, data.bookingRequestId),
            eq(marketplaceReviews.consumerId, userId),
          ));

        if (existingReview) {
          return res.status(409).json({ error: "You have already reviewed this booking" });
        }

        isVerified = true;
      } else {
        const [completedBooking] = await db.select({ id: bookingRequests.id })
          .from(bookingRequests)
          .where(and(
            eq(bookingRequests.consumerId, userId),
            eq(bookingRequests.providerId, data.providerId),
            eq(bookingRequests.status, "COMPLETED"),
          ));

        if (!completedBooking) {
          return res.status(403).json({
            error: "You must have a completed booking with this provider to leave a review",
          });
        }
      }

      const [review] = await db.insert(marketplaceReviews).values({
        providerId: data.providerId,
        consumerId: userId,
        bookingRequestId: data.bookingRequestId || null,
        overallRating: data.overallRating,
        qualityRating: data.qualityRating || null,
        punctualityRating: data.punctualityRating || null,
        valueRating: data.valueRating || null,
        reviewText: data.reviewText || null,
        isVerified,
      }).returning();

      const [stats] = await db.select({
        avgRating: sql<string>`round(avg(${marketplaceReviews.overallRating})::numeric, 2)`,
        totalCount: count(),
      }).from(marketplaceReviews)
        .where(eq(marketplaceReviews.providerId, data.providerId));

      await db.update(serviceProviders)
        .set({
          averageRating: stats.avgRating,
          totalReviews: stats.totalCount,
          updatedAt: new Date(),
        })
        .where(eq(serviceProviders.id, data.providerId));

      res.status(201).json(review);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Review submission failed", { error: err });
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  router.get("/providers/:slug/reviews", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
      const offset = (page - 1) * limit;

      const [profile] = await db.select({ providerId: providerProfiles.providerId })
        .from(providerProfiles)
        .where(eq(providerProfiles.slug, slug));

      if (!profile) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const reviews = await db.select().from(marketplaceReviews)
        .where(and(
          eq(marketplaceReviews.providerId, profile.providerId),
          eq(marketplaceReviews.isPublic, true),
        ))
        .orderBy(desc(marketplaceReviews.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({ total: count() })
        .from(marketplaceReviews)
        .where(and(
          eq(marketplaceReviews.providerId, profile.providerId),
          eq(marketplaceReviews.isPublic, true),
        ));

      const [ratingBreakdown] = await db.select({
        avgOverall: sql<string>`round(avg(${marketplaceReviews.overallRating})::numeric, 2)`,
        avgQuality: sql<string>`round(avg(${marketplaceReviews.qualityRating})::numeric, 2)`,
        avgPunctuality: sql<string>`round(avg(${marketplaceReviews.punctualityRating})::numeric, 2)`,
        avgValue: sql<string>`round(avg(${marketplaceReviews.valueRating})::numeric, 2)`,
        verifiedCount: sql<number>`count(*) filter (where ${marketplaceReviews.isVerified} = true)`,
        star5: sql<number>`count(*) filter (where ${marketplaceReviews.overallRating} = 5)`,
        star4: sql<number>`count(*) filter (where ${marketplaceReviews.overallRating} = 4)`,
        star3: sql<number>`count(*) filter (where ${marketplaceReviews.overallRating} = 3)`,
        star2: sql<number>`count(*) filter (where ${marketplaceReviews.overallRating} = 2)`,
        star1: sql<number>`count(*) filter (where ${marketplaceReviews.overallRating} = 1)`,
      }).from(marketplaceReviews)
        .where(and(
          eq(marketplaceReviews.providerId, profile.providerId),
          eq(marketplaceReviews.isPublic, true),
        ));

      res.json({
        reviews,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        ratingBreakdown: {
          averageOverall: ratingBreakdown?.avgOverall ? parseFloat(ratingBreakdown.avgOverall) : null,
          averageQuality: ratingBreakdown?.avgQuality ? parseFloat(ratingBreakdown.avgQuality) : null,
          averagePunctuality: ratingBreakdown?.avgPunctuality ? parseFloat(ratingBreakdown.avgPunctuality) : null,
          averageValue: ratingBreakdown?.avgValue ? parseFloat(ratingBreakdown.avgValue) : null,
          verifiedCount: ratingBreakdown?.verifiedCount || 0,
          distribution: {
            5: ratingBreakdown?.star5 || 0,
            4: ratingBreakdown?.star4 || 0,
            3: ratingBreakdown?.star3 || 0,
            2: ratingBreakdown?.star2 || 0,
            1: ratingBreakdown?.star1 || 0,
          },
        },
      });
    } catch (err: unknown) {
      logger.error("Failed to fetch provider reviews", { error: err });
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  router.post("/reviews/:id/helpful", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const [review] = await db.select().from(marketplaceReviews)
        .where(eq(marketplaceReviews.id, req.params.id));

      if (!review) return res.status(404).json({ error: "Review not found" });

      if (review.consumerId === userId) {
        return res.status(400).json({ error: "You cannot mark your own review as helpful" });
      }

      const [updated] = await db.update(marketplaceReviews)
        .set({ helpfulCount: sql`${marketplaceReviews.helpfulCount} + 1` })
        .where(eq(marketplaceReviews.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      logger.error("Failed to mark review helpful", { error: err });
      res.status(500).json({ error: "Failed to mark review as helpful" });
    }
  });

  router.post("/reviews/:id/report", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const reportSchema = z.object({
        reason: z.string().min(1).max(500),
      });

      const { reason } = reportSchema.parse(req.body);

      const [review] = await db.select().from(marketplaceReviews)
        .where(eq(marketplaceReviews.id, req.params.id));

      if (!review) return res.status(404).json({ error: "Review not found" });

      if (review.reportedAt) {
        return res.status(409).json({ error: "This review has already been reported" });
      }

      const [updated] = await db.update(marketplaceReviews)
        .set({
          reportedAt: new Date(),
          reportReason: reason,
        })
        .where(eq(marketplaceReviews.id, req.params.id))
        .returning();

      res.json({ message: "Review reported successfully", review: updated });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Failed to report review", { error: err });
      res.status(500).json({ error: "Failed to report review" });
    }
  });

  router.post("/booking-requests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const householdId = getHouseholdId(req);
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const bookingSchema = z.object({
        providerId: z.string().min(1),
        serviceCategory: z.string().min(1).max(100),
        serviceType: z.string().max(200).optional(),
        requestedDate: z.string().min(1),
        requestedTimeSlot: z.string().max(50).optional(),
        flexibleDates: z.boolean().optional(),
        alternativeDates: z.array(z.string()).optional(),
        propertyDetails: z.object({
          sqft: z.number().optional(),
          bedrooms: z.number().optional(),
          bathrooms: z.number().optional(),
          specialInstructions: z.string().optional(),
        }).optional(),
        consumerNotes: z.string().optional(),
      });

      const data = bookingSchema.parse(req.body);

      const [provider] = await db.select({ id: serviceProviders.id })
        .from(serviceProviders)
        .where(eq(serviceProviders.id, data.providerId));
      if (!provider) return res.status(404).json({ error: "Provider not found" });

      const [booking] = await db.insert(bookingRequests).values({
        consumerId: userId,
        consumerHouseholdId: householdId,
        providerId: data.providerId,
        serviceCategory: data.serviceCategory,
        serviceType: data.serviceType || null,
        requestedDate: data.requestedDate,
        requestedTimeSlot: data.requestedTimeSlot || null,
        flexibleDates: data.flexibleDates || false,
        alternativeDates: data.alternativeDates || null,
        propertyDetails: data.propertyDetails || null,
        consumerNotes: data.consumerNotes || null,
      }).returning();

      res.status(201).json(booking);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Booking request creation failed", { error: err });
      res.status(500).json({ error: "Failed to create booking request" });
    }
  });

  router.get("/booking-requests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { status, limit: limitStr, offset: offsetStr } = req.query;
      const limit = Math.min(parseInt(limitStr as string) || 20, 100);
      const offset = parseInt(offsetStr as string) || 0;

      let conditions = [eq(bookingRequests.consumerId, userId)];
      if (status && typeof status === "string") {
        conditions.push(eq(bookingRequests.status, status as any));
      }

      const results = await db.select({
        booking: bookingRequests,
        providerName: serviceProviders.businessName,
        providerType: serviceProviders.type,
      })
        .from(bookingRequests)
        .leftJoin(serviceProviders, eq(bookingRequests.providerId, serviceProviders.id))
        .where(and(...conditions))
        .orderBy(desc(bookingRequests.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        requests: results.map(r => ({ ...r.booking, providerName: r.providerName, providerType: r.providerType })),
        pagination: { limit, offset },
      });
    } catch (err: unknown) {
      logger.error("Failed to fetch consumer booking requests", { error: err });
      res.status(500).json({ error: "Failed to fetch booking requests" });
    }
  });

  router.post("/booking-requests/:id/confirm", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const [booking] = await db.select().from(bookingRequests)
        .where(and(
          eq(bookingRequests.id, req.params.id),
          eq(bookingRequests.consumerId, userId),
        ));

      if (!booking) return res.status(404).json({ error: "Booking request not found" });
      if (booking.status !== "ACCEPTED") {
        return res.status(400).json({ error: "Can only confirm accepted bookings" });
      }

      const [updated] = await db.update(bookingRequests)
        .set({
          finalPriceCents: booking.quotedPriceCents,
          bookedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bookingRequests.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      logger.error("Booking confirmation failed", { error: err });
      res.status(500).json({ error: "Failed to confirm booking" });
    }
  });

  router.post("/booking-requests/:id/cancel", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const [booking] = await db.select().from(bookingRequests)
        .where(and(
          eq(bookingRequests.id, req.params.id),
          eq(bookingRequests.consumerId, userId),
        ));

      if (!booking) return res.status(404).json({ error: "Booking request not found" });
      if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
        return res.status(400).json({ error: `Cannot cancel a ${booking.status.toLowerCase()} booking` });
      }

      const [updated] = await db.update(bookingRequests)
        .set({
          status: "CANCELLED",
          updatedAt: new Date(),
        })
        .where(eq(bookingRequests.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      logger.error("Booking cancellation failed", { error: err });
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  router.get("/booking-requests/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const [booking] = await db.select().from(bookingRequests)
        .where(eq(bookingRequests.id, req.params.id));

      if (!booking) return res.status(404).json({ error: "Booking request not found" });

      if (booking.consumerId !== userId) {
        const [provider] = await db.select({ id: serviceProviders.id })
          .from(serviceProviders)
          .where(and(eq(serviceProviders.id, booking.providerId), eq(serviceProviders.ownerId, userId)));
        if (!provider) return res.status(403).json({ error: "Not authorized to view these messages" });
      }

      const messages = await db.select().from(bookingMessages)
        .where(eq(bookingMessages.bookingRequestId, req.params.id))
        .orderBy(asc(bookingMessages.createdAt));

      res.json(messages);
    } catch (err: unknown) {
      logger.error("Failed to fetch booking messages", { error: err });
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  router.post("/booking-requests/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const [booking] = await db.select().from(bookingRequests)
        .where(eq(bookingRequests.id, req.params.id));

      if (!booking) return res.status(404).json({ error: "Booking request not found" });

      let senderType: "CONSUMER" | "PROVIDER";
      if (booking.consumerId === userId) {
        senderType = "CONSUMER";
      } else {
        const [provider] = await db.select({ id: serviceProviders.id })
          .from(serviceProviders)
          .where(and(eq(serviceProviders.id, booking.providerId), eq(serviceProviders.ownerId, userId)));
        if (!provider) return res.status(403).json({ error: "Not authorized to send messages on this booking" });
        senderType = "PROVIDER";
      }

      const msgSchema = z.object({
        message: z.string().min(1).max(5000),
        attachments: z.array(z.string()).optional(),
      });

      const data = msgSchema.parse(req.body);

      const [msg] = await db.insert(bookingMessages).values({
        bookingRequestId: req.params.id,
        senderId: userId,
        senderType,
        message: data.message,
        attachments: data.attachments || null,
      }).returning();

      res.status(201).json(msg);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Failed to send booking message", { error: err });
      res.status(500).json({ error: "Failed to send message" });
    }
  });
}
