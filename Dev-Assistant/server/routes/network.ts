import type { Request, Response } from "express";
import type { Router } from "express";
import { db } from "../db";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { apiLimiter } from "../lib/rate-limit";
import {
  householdConnections,
  vendorReviews,
  vendorShares,
  referrals,
  groupBuyRequests,
  groupBuyOffers,
  groupBuyParticipants,
  backupProviders,
  emergencyCoverageRequests,
  vendors,
  households,
  users,
} from "@shared/schema";
import { eq, and, or, sql, desc, isNull } from "drizzle-orm";

const householdContext = householdContextMiddleware;

function getHouseholdId(req: Request): string {
  return (req as any).householdId;
}

function getUserId(req: Request): string {
  return (req as any).user?.id || (req as any).userId;
}

async function getConnectedHouseholdIds(householdId: string): Promise<string[]> {
  const connections = await db
    .select()
    .from(householdConnections)
    .where(
      and(
        eq(householdConnections.status, "ACCEPTED"),
        or(
          eq(householdConnections.requesterHouseholdId, householdId),
          eq(householdConnections.targetHouseholdId, householdId)
        )
      )
    );
  return connections.map((c) =>
    c.requesterHouseholdId === householdId
      ? c.targetHouseholdId
      : c.requesterHouseholdId
  );
}

async function isConnected(householdA: string, householdB: string): Promise<boolean> {
  const [conn] = await db
    .select()
    .from(householdConnections)
    .where(
      and(
        eq(householdConnections.status, "ACCEPTED"),
        or(
          and(
            eq(householdConnections.requesterHouseholdId, householdA),
            eq(householdConnections.targetHouseholdId, householdB)
          ),
          and(
            eq(householdConnections.requesterHouseholdId, householdB),
            eq(householdConnections.targetHouseholdId, householdA)
          )
        )
      )
    )
    .limit(1);
  return !!conn;
}

export function registerNetworkRoutes(app: Router) {

  // ===== CONNECTIONS =====

  app.get(
    "/network/connections",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const connections = await db
          .select({
            id: householdConnections.id,
            requesterHouseholdId: householdConnections.requesterHouseholdId,
            targetHouseholdId: householdConnections.targetHouseholdId,
            status: householdConnections.status,
            message: householdConnections.message,
            requestedByUserId: householdConnections.requestedByUserId,
            createdAt: householdConnections.createdAt,
          })
          .from(householdConnections)
          .where(
            or(
              eq(householdConnections.requesterHouseholdId, householdId),
              eq(householdConnections.targetHouseholdId, householdId)
            )
          )
          .orderBy(desc(householdConnections.createdAt));

        const enriched = await Promise.all(
          connections.map(async (conn) => {
            const otherHouseholdId =
              conn.requesterHouseholdId === householdId
                ? conn.targetHouseholdId
                : conn.requesterHouseholdId;
            const [otherHousehold] = await db
              .select({ name: households.name })
              .from(households)
              .where(eq(households.id, otherHouseholdId))
              .limit(1);
            return {
              ...conn,
              otherHouseholdId,
              otherHouseholdName: otherHousehold?.name || "Unknown",
              direction:
                conn.requesterHouseholdId === householdId ? "sent" : "received",
            };
          })
        );

        res.json(enriched);
      } catch (error) {
        logger.error("Failed to fetch connections", { error });
        res.status(500).json({ error: "Failed to fetch connections" });
      }
    }
  );

  app.post(
    "/network/connections",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { targetHouseholdId, message } = req.body;

        if (!targetHouseholdId) {
          return res.status(400).json({ error: "Target household ID is required" });
        }

        if (targetHouseholdId === householdId) {
          return res.status(400).json({ error: "Cannot connect to your own household" });
        }

        const [existing] = await db
          .select()
          .from(householdConnections)
          .where(
            or(
              and(
                eq(householdConnections.requesterHouseholdId, householdId),
                eq(householdConnections.targetHouseholdId, targetHouseholdId)
              ),
              and(
                eq(householdConnections.requesterHouseholdId, targetHouseholdId),
                eq(householdConnections.targetHouseholdId, householdId)
              )
            )
          )
          .limit(1);

        if (existing) {
          return res.status(409).json({ error: "Connection already exists", status: existing.status });
        }

        const [connection] = await db
          .insert(householdConnections)
          .values({
            requesterHouseholdId: householdId,
            targetHouseholdId,
            requestedByUserId: userId,
            message,
            status: "PENDING",
          })
          .returning();

        res.status(201).json(connection);
      } catch (error) {
        logger.error("Failed to create connection", { error });
        res.status(500).json({ error: "Failed to create connection" });
      }
    }
  );

  app.post(
    "/network/connections/:id/accept",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { id } = req.params;

        const [conn] = await db
          .select()
          .from(householdConnections)
          .where(
            and(
              eq(householdConnections.id, id),
              eq(householdConnections.targetHouseholdId, householdId),
              eq(householdConnections.status, "PENDING")
            )
          )
          .limit(1);

        if (!conn) {
          return res.status(404).json({ error: "Connection request not found" });
        }

        const [updated] = await db
          .update(householdConnections)
          .set({ status: "ACCEPTED", respondedByUserId: userId, updatedAt: new Date() })
          .where(eq(householdConnections.id, id))
          .returning();

        res.json(updated);
      } catch (error) {
        logger.error("Failed to accept connection", { error });
        res.status(500).json({ error: "Failed to accept connection" });
      }
    }
  );

  app.post(
    "/network/connections/:id/reject",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { id } = req.params;

        const [conn] = await db
          .select()
          .from(householdConnections)
          .where(
            and(
              eq(householdConnections.id, id),
              eq(householdConnections.targetHouseholdId, householdId),
              eq(householdConnections.status, "PENDING")
            )
          )
          .limit(1);

        if (!conn) {
          return res.status(404).json({ error: "Connection request not found" });
        }

        const [updated] = await db
          .update(householdConnections)
          .set({ status: "BLOCKED", respondedByUserId: userId, updatedAt: new Date() })
          .where(eq(householdConnections.id, id))
          .returning();

        res.json(updated);
      } catch (error) {
        logger.error("Failed to reject connection", { error });
        res.status(500).json({ error: "Failed to reject connection" });
      }
    }
  );

  app.delete(
    "/network/connections/:id",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const { id } = req.params;

        const [conn] = await db
          .select()
          .from(householdConnections)
          .where(
            and(
              eq(householdConnections.id, id),
              or(
                eq(householdConnections.requesterHouseholdId, householdId),
                eq(householdConnections.targetHouseholdId, householdId)
              )
            )
          )
          .limit(1);

        if (!conn) {
          return res.status(404).json({ error: "Connection not found" });
        }

        await db
          .delete(householdConnections)
          .where(eq(householdConnections.id, id));

        res.json({ success: true });
      } catch (error) {
        logger.error("Failed to delete connection", { error });
        res.status(500).json({ error: "Failed to delete connection" });
      }
    }
  );

  // ===== VENDOR REVIEWS =====

  app.get(
    "/network/vendor-reviews/:vendorId",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const { vendorId } = req.params;

        const connectedIds = await getConnectedHouseholdIds(householdId);
        const allHouseholdIds = [householdId, ...connectedIds];

        const reviews = await db
          .select({
            id: vendorReviews.id,
            vendorId: vendorReviews.vendorId,
            householdId: vendorReviews.householdId,
            userId: vendorReviews.userId,
            rating: vendorReviews.rating,
            reviewText: vendorReviews.reviewText,
            createdAt: vendorReviews.createdAt,
          })
          .from(vendorReviews)
          .where(
            and(
              eq(vendorReviews.vendorId, vendorId),
              eq(vendorReviews.isPublicToNetwork, true),
              sql`${vendorReviews.householdId} = ANY(${allHouseholdIds})`
            )
          )
          .orderBy(desc(vendorReviews.createdAt));

        const enriched = await Promise.all(
          reviews.map(async (review) => {
            const [profile] = await db
              .select({ firstName: users.firstName, lastName: users.lastName })
              .from(users)
              .where(eq(users.id, review.userId))
              .limit(1);
            const isOwn = review.householdId === householdId;
            return {
              ...review,
              reviewerName: profile
                ? `${profile.firstName || ""} ${(profile.lastName || "").charAt(0)}.`.trim()
                : "Someone",
              isFromYourHousehold: isOwn,
            };
          })
        );

        res.json(enriched);
      } catch (error) {
        logger.error("Failed to fetch vendor reviews", { error });
        res.status(500).json({ error: "Failed to fetch vendor reviews" });
      }
    }
  );

  app.post(
    "/network/vendor-reviews",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { vendorId, rating, reviewText, isPublicToNetwork } = req.body;

        if (!vendorId || !rating || rating < 1 || rating > 5) {
          return res.status(400).json({ error: "vendorId and rating (1-5) are required" });
        }

        const [vendor] = await db
          .select()
          .from(vendors)
          .where(and(eq(vendors.id, vendorId), eq(vendors.householdId, householdId)))
          .limit(1);

        if (!vendor) {
          return res.status(404).json({ error: "Vendor not found in your household" });
        }

        const [review] = await db
          .insert(vendorReviews)
          .values({
            vendorId,
            householdId,
            userId,
            rating,
            reviewText: reviewText || null,
            isPublicToNetwork: isPublicToNetwork !== false,
          })
          .returning();

        res.status(201).json(review);
      } catch (error) {
        logger.error("Failed to create vendor review", { error });
        res.status(500).json({ error: "Failed to create vendor review" });
      }
    }
  );

  // ===== VENDOR SHARING =====

  app.get(
    "/network/vendor-shares",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);

        const shares = await db
          .select({
            id: vendorShares.id,
            vendorId: vendorShares.vendorId,
            fromHouseholdId: vendorShares.fromHouseholdId,
            toHouseholdId: vendorShares.toHouseholdId,
            message: vendorShares.message,
            createdAt: vendorShares.createdAt,
            vendorName: vendors.name,
            vendorCategory: vendors.category,
            vendorPhone: vendors.phone,
            vendorEmail: vendors.email,
          })
          .from(vendorShares)
          .leftJoin(vendors, eq(vendorShares.vendorId, vendors.id))
          .where(
            or(
              eq(vendorShares.fromHouseholdId, householdId),
              eq(vendorShares.toHouseholdId, householdId)
            )
          )
          .orderBy(desc(vendorShares.createdAt));

        const enriched = await Promise.all(
          shares.map(async (share) => {
            const otherHouseholdId =
              share.fromHouseholdId === householdId
                ? share.toHouseholdId
                : share.fromHouseholdId;
            const [otherHousehold] = await db
              .select({ name: households.name })
              .from(households)
              .where(eq(households.id, otherHouseholdId))
              .limit(1);

            return {
              ...share,
              otherHouseholdName: otherHousehold?.name || "Unknown",
              direction: share.fromHouseholdId === householdId ? "sent" : "received",
            };
          })
        );

        res.json(enriched);
      } catch (error) {
        logger.error("Failed to fetch vendor shares", { error });
        res.status(500).json({ error: "Failed to fetch vendor shares" });
      }
    }
  );

  app.post(
    "/network/vendor-shares",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { vendorId, toHouseholdId, message } = req.body;

        if (!vendorId || !toHouseholdId) {
          return res.status(400).json({ error: "vendorId and toHouseholdId are required" });
        }

        const connected = await isConnected(householdId, toHouseholdId);
        if (!connected) {
          return res.status(403).json({ error: "You must be connected to share vendors" });
        }

        const [vendor] = await db
          .select()
          .from(vendors)
          .where(and(eq(vendors.id, vendorId), eq(vendors.householdId, householdId)))
          .limit(1);

        if (!vendor) {
          return res.status(404).json({ error: "Vendor not found in your household" });
        }

        const [share] = await db
          .insert(vendorShares)
          .values({
            vendorId,
            fromHouseholdId: householdId,
            toHouseholdId,
            sharedByUserId: userId,
            message: message || null,
          })
          .returning();

        res.status(201).json(share);
      } catch (error) {
        logger.error("Failed to share vendor", { error });
        res.status(500).json({ error: "Failed to share vendor" });
      }
    }
  );

  // ===== REFERRALS =====

  app.get(
    "/network/referrals",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);

        const allReferrals = await db
          .select({
            id: referrals.id,
            vendorId: referrals.vendorId,
            fromHouseholdId: referrals.fromHouseholdId,
            toHouseholdId: referrals.toHouseholdId,
            status: referrals.status,
            message: referrals.message,
            createdAt: referrals.createdAt,
            vendorName: vendors.name,
            vendorCategory: vendors.category,
            vendorPhone: vendors.phone,
          })
          .from(referrals)
          .leftJoin(vendors, eq(referrals.vendorId, vendors.id))
          .where(
            or(
              eq(referrals.fromHouseholdId, householdId),
              eq(referrals.toHouseholdId, householdId)
            )
          )
          .orderBy(desc(referrals.createdAt));

        const enriched = await Promise.all(
          allReferrals.map(async (ref) => {
            const otherHouseholdId =
              ref.fromHouseholdId === householdId
                ? ref.toHouseholdId
                : ref.fromHouseholdId;
            const [otherHousehold] = await db
              .select({ name: households.name })
              .from(households)
              .where(eq(households.id, otherHouseholdId))
              .limit(1);
            return {
              ...ref,
              otherHouseholdName: otherHousehold?.name || "Unknown",
              direction: ref.fromHouseholdId === householdId ? "sent" : "received",
            };
          })
        );

        res.json(enriched);
      } catch (error) {
        logger.error("Failed to fetch referrals", { error });
        res.status(500).json({ error: "Failed to fetch referrals" });
      }
    }
  );

  app.post(
    "/network/referrals",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { vendorId, toHouseholdId, message } = req.body;

        if (!vendorId || !toHouseholdId) {
          return res.status(400).json({ error: "vendorId and toHouseholdId are required" });
        }

        const connected = await isConnected(householdId, toHouseholdId);
        if (!connected) {
          return res.status(403).json({ error: "You must be connected to send referrals" });
        }

        const [referral] = await db
          .insert(referrals)
          .values({
            vendorId,
            fromHouseholdId: householdId,
            toHouseholdId,
            referredByUserId: userId,
            message: message || null,
            status: "SENT",
          })
          .returning();

        res.status(201).json(referral);
      } catch (error) {
        logger.error("Failed to create referral", { error });
        res.status(500).json({ error: "Failed to create referral" });
      }
    }
  );

  app.post(
    "/network/referrals/:id/respond",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const { id } = req.params;
        const { status } = req.body;

        if (!["ACCEPTED", "DECLINED"].includes(status)) {
          return res.status(400).json({ error: "Status must be ACCEPTED or DECLINED" });
        }

        const [ref] = await db
          .select()
          .from(referrals)
          .where(
            and(
              eq(referrals.id, id),
              eq(referrals.toHouseholdId, householdId),
              eq(referrals.status, "SENT")
            )
          )
          .limit(1);

        if (!ref) {
          return res.status(404).json({ error: "Referral not found" });
        }

        const [updated] = await db
          .update(referrals)
          .set({ status, respondedAt: new Date() })
          .where(eq(referrals.id, id))
          .returning();

        res.json(updated);
      } catch (error) {
        logger.error("Failed to respond to referral", { error });
        res.status(500).json({ error: "Failed to respond to referral" });
      }
    }
  );

  // ===== GROUP BUYING =====

  app.get(
    "/network/group-buys",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const connectedIds = await getConnectedHouseholdIds(householdId);
        const allHouseholdIds = [householdId, ...connectedIds];

        const offers = await db
          .select()
          .from(groupBuyOffers)
          .where(
            and(
              eq(groupBuyOffers.status, "OPEN"),
              sql`${groupBuyOffers.createdByHouseholdId} = ANY(${allHouseholdIds})`
            )
          )
          .orderBy(desc(groupBuyOffers.createdAt));

        const enriched = await Promise.all(
          offers.map(async (offer) => {
            const participants = await db
              .select({ householdId: groupBuyParticipants.householdId })
              .from(groupBuyParticipants)
              .where(eq(groupBuyParticipants.offerId, offer.id));

            const [creatorHousehold] = await db
              .select({ name: households.name })
              .from(households)
              .where(eq(households.id, offer.createdByHouseholdId))
              .limit(1);

            return {
              ...offer,
              participants: participants.length,
              hasJoined: participants.some((p) => p.householdId === householdId),
              creatorHouseholdName: creatorHousehold?.name || "Unknown",
            };
          })
        );

        res.json(enriched);
      } catch (error) {
        logger.error("Failed to fetch group buys", { error });
        res.status(500).json({ error: "Failed to fetch group buys" });
      }
    }
  );

  app.post(
    "/network/group-buys",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const {
          vendorName,
          vendorId,
          serviceCategory,
          description,
          discountPercent,
          minHouseholds,
          maxHouseholds,
          location,
          expiresAt,
        } = req.body;

        if (!vendorName || !serviceCategory || !description || !discountPercent) {
          return res.status(400).json({
            error: "vendorName, serviceCategory, description, and discountPercent are required",
          });
        }

        const [offer] = await db
          .insert(groupBuyOffers)
          .values({
            vendorId: vendorId || null,
            vendorName,
            serviceCategory,
            description,
            discountPercent,
            minHouseholds: minHouseholds || 2,
            maxHouseholds: maxHouseholds || null,
            location: location || null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            createdByHouseholdId: householdId,
            createdByUserId: userId,
            status: "OPEN",
            currentHouseholds: 1,
          })
          .returning();

        await db.insert(groupBuyParticipants).values({
          offerId: offer.id,
          householdId,
          joinedByUserId: userId,
        });

        res.status(201).json(offer);
      } catch (error) {
        logger.error("Failed to create group buy", { error });
        res.status(500).json({ error: "Failed to create group buy" });
      }
    }
  );

  app.post(
    "/network/group-buys/:id/join",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { id } = req.params;

        const [offer] = await db
          .select()
          .from(groupBuyOffers)
          .where(and(eq(groupBuyOffers.id, id), eq(groupBuyOffers.status, "OPEN")))
          .limit(1);

        if (!offer) {
          return res.status(404).json({ error: "Group buy not found or closed" });
        }

        if (offer.maxHouseholds && offer.currentHouseholds >= offer.maxHouseholds) {
          return res.status(400).json({ error: "Group buy is full" });
        }

        const [existing] = await db
          .select()
          .from(groupBuyParticipants)
          .where(
            and(
              eq(groupBuyParticipants.offerId, id),
              eq(groupBuyParticipants.householdId, householdId)
            )
          )
          .limit(1);

        if (existing) {
          return res.status(409).json({ error: "Already joined this group buy" });
        }

        await db.insert(groupBuyParticipants).values({
          offerId: id,
          householdId,
          joinedByUserId: userId,
        });

        const [updated] = await db
          .update(groupBuyOffers)
          .set({
            currentHouseholds: sql`${groupBuyOffers.currentHouseholds} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(groupBuyOffers.id, id))
          .returning();

        if (
          updated.currentHouseholds >= updated.minHouseholds
        ) {
          await db
            .update(groupBuyOffers)
            .set({ status: "MATCHED", updatedAt: new Date() })
            .where(eq(groupBuyOffers.id, id));
        }

        res.json({ success: true, currentHouseholds: updated.currentHouseholds });
      } catch (error) {
        logger.error("Failed to join group buy", { error });
        res.status(500).json({ error: "Failed to join group buy" });
      }
    }
  );

  // ===== EMERGENCY COVERAGE =====

  app.get(
    "/network/backup-providers",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const connectedIds = await getConnectedHouseholdIds(householdId);
        const allHouseholdIds = [householdId, ...connectedIds];

        const providers = await db
          .select({
            id: backupProviders.id,
            vendorId: backupProviders.vendorId,
            householdId: backupProviders.householdId,
            serviceCategory: backupProviders.serviceCategory,
            isAvailable: backupProviders.isAvailable,
            contactName: backupProviders.contactName,
            contactPhone: backupProviders.contactPhone,
            notes: backupProviders.notes,
            createdAt: backupProviders.createdAt,
            vendorName: vendors.name,
          })
          .from(backupProviders)
          .leftJoin(vendors, eq(backupProviders.vendorId, vendors.id))
          .where(
            and(
              eq(backupProviders.isAvailable, true),
              sql`${backupProviders.householdId} = ANY(${allHouseholdIds})`
            )
          )
          .orderBy(desc(backupProviders.createdAt));

        const enriched = await Promise.all(
          providers.map(async (prov) => {
            const [household] = await db
              .select({ name: households.name })
              .from(households)
              .where(eq(households.id, prov.householdId))
              .limit(1);
            return {
              ...prov,
              householdName: household?.name || "Unknown",
              isOwn: prov.householdId === householdId,
            };
          })
        );

        res.json(enriched);
      } catch (error) {
        logger.error("Failed to fetch backup providers", { error });
        res.status(500).json({ error: "Failed to fetch backup providers" });
      }
    }
  );

  app.post(
    "/network/backup-providers",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const { vendorId, serviceCategory, contactName, contactPhone, notes } = req.body;

        if (!vendorId || !serviceCategory) {
          return res.status(400).json({ error: "vendorId and serviceCategory are required" });
        }

        const [vendor] = await db
          .select()
          .from(vendors)
          .where(and(eq(vendors.id, vendorId), eq(vendors.householdId, householdId)))
          .limit(1);

        if (!vendor) {
          return res.status(404).json({ error: "Vendor not found in your household" });
        }

        const [provider] = await db
          .insert(backupProviders)
          .values({
            vendorId,
            householdId,
            serviceCategory,
            contactName: contactName || vendor.name,
            contactPhone: contactPhone || vendor.phone,
            notes: notes || null,
            isAvailable: true,
          })
          .returning();

        res.status(201).json(provider);
      } catch (error) {
        logger.error("Failed to add backup provider", { error });
        res.status(500).json({ error: "Failed to add backup provider" });
      }
    }
  );

  app.get(
    "/network/emergency-requests",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const connectedIds = await getConnectedHouseholdIds(householdId);
        const allHouseholdIds = [householdId, ...connectedIds];

        const requests = await db
          .select()
          .from(emergencyCoverageRequests)
          .where(
            sql`${emergencyCoverageRequests.householdId} = ANY(${allHouseholdIds})`
          )
          .orderBy(desc(emergencyCoverageRequests.createdAt));

        const enriched = await Promise.all(
          requests.map(async (req) => {
            const [household] = await db
              .select({ name: households.name })
              .from(households)
              .where(eq(households.id, req.householdId))
              .limit(1);
            return {
              ...req,
              householdName: household?.name || "Unknown",
              isOwn: req.householdId === householdId,
            };
          })
        );

        res.json(enriched);
      } catch (error) {
        logger.error("Failed to fetch emergency requests", { error });
        res.status(500).json({ error: "Failed to fetch emergency requests" });
      }
    }
  );

  app.post(
    "/network/emergency-requests",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const userId = getUserId(req);
        const { serviceCategory, originalVendorId, reason, neededBy } = req.body;

        if (!serviceCategory) {
          return res.status(400).json({ error: "serviceCategory is required" });
        }

        const [request] = await db
          .insert(emergencyCoverageRequests)
          .values({
            householdId,
            createdByUserId: userId,
            serviceCategory,
            originalVendorId: originalVendorId || null,
            reason: reason || null,
            neededBy: neededBy ? new Date(neededBy) : null,
            status: "OPEN",
          })
          .returning();

        res.status(201).json(request);
      } catch (error) {
        logger.error("Failed to create emergency request", { error });
        res.status(500).json({ error: "Failed to create emergency request" });
      }
    }
  );

  app.post(
    "/network/emergency-requests/:id/fulfill",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);
        const { id } = req.params;
        const { backupProviderId } = req.body;

        if (!backupProviderId) {
          return res.status(400).json({ error: "backupProviderId is required" });
        }

        const [emergReq] = await db
          .select()
          .from(emergencyCoverageRequests)
          .where(
            and(
              eq(emergencyCoverageRequests.id, id),
              eq(emergencyCoverageRequests.status, "OPEN")
            )
          )
          .limit(1);

        if (!emergReq) {
          return res.status(404).json({ error: "Emergency request not found or already fulfilled" });
        }

        const connectedIds = await getConnectedHouseholdIds(householdId);
        if (
          emergReq.householdId !== householdId &&
          !connectedIds.includes(emergReq.householdId)
        ) {
          return res.status(403).json({ error: "Not authorized to fulfill this request" });
        }

        const [updated] = await db
          .update(emergencyCoverageRequests)
          .set({
            status: "FULFILLED",
            fulfilledByProviderId: backupProviderId,
            fulfilledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emergencyCoverageRequests.id, id))
          .returning();

        res.json(updated);
      } catch (error) {
        logger.error("Failed to fulfill emergency request", { error });
        res.status(500).json({ error: "Failed to fulfill emergency request" });
      }
    }
  );

  // ===== NETWORK SUMMARY =====

  app.get(
    "/network/summary",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const householdId = getHouseholdId(req);

        const [connectionsResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(householdConnections)
          .where(
            and(
              eq(householdConnections.status, "ACCEPTED"),
              or(
                eq(householdConnections.requesterHouseholdId, householdId),
                eq(householdConnections.targetHouseholdId, householdId)
              )
            )
          );

        const [pendingResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(householdConnections)
          .where(
            and(
              eq(householdConnections.targetHouseholdId, householdId),
              eq(householdConnections.status, "PENDING")
            )
          );

        const [pendingReferrals] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(referrals)
          .where(
            and(
              eq(referrals.toHouseholdId, householdId),
              eq(referrals.status, "SENT")
            )
          );

        const connectedIds = await getConnectedHouseholdIds(householdId);
        const allHouseholdIds = [householdId, ...connectedIds];

        const [openGroupBuys] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(groupBuyOffers)
          .where(
            and(
              eq(groupBuyOffers.status, "OPEN"),
              sql`${groupBuyOffers.createdByHouseholdId} = ANY(${allHouseholdIds})`
            )
          );

        const [openEmergency] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(emergencyCoverageRequests)
          .where(
            and(
              eq(emergencyCoverageRequests.status, "OPEN"),
              sql`${emergencyCoverageRequests.householdId} = ANY(${allHouseholdIds})`
            )
          );

        res.json({
          connections: connectionsResult?.count || 0,
          pendingRequests: pendingResult?.count || 0,
          pendingReferrals: pendingReferrals?.count || 0,
          openGroupBuys: openGroupBuys?.count || 0,
          openEmergencyRequests: openEmergency?.count || 0,
        });
      } catch (error) {
        logger.error("Failed to fetch network summary", { error });
        res.status(500).json({ error: "Failed to fetch network summary" });
      }
    }
  );
}
