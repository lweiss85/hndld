import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../db";
import {
  serviceProviders, providerStaff, providerClients, providerSchedule,
  providerProfiles, marketplaceReviews, bookingRequests,
  vendors, households,
  type InsertServiceProvider, type ProviderClient, type ProviderStaff as ProviderStaffType,
  type ProviderScheduleItem, type InsertProviderProfile,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, count, asc } from "drizzle-orm";
import { isAuthenticated } from "../../replit_integrations/auth";
import logger from "../../lib/logger";
import { z, ZodError } from "zod";

function getUserId(req: Request): string | null {
  return (req as any).user?.id || (req as any).userId || null;
}

async function getProviderForUser(userId: string) {
  const [provider] = await db.select().from(serviceProviders)
    .where(eq(serviceProviders.ownerId, userId));
  return provider || null;
}

function requireProvider(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  getProviderForUser(userId).then(provider => {
    if (!provider) return res.status(403).json({ error: "No provider account found" });
    (req as any).provider = provider;
    (req as any).providerId = provider.id;
    next();
  }).catch(err => {
    logger.error("Provider lookup failed", { error: err });
    res.status(500).json({ error: "Internal error" });
  });
}

function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError || (err !== null && typeof err === "object" && (err as any).name === "ZodError");
}

function isDbConstraintError(err: unknown): boolean {
  return err !== null && typeof err === "object" && (err as any).code === "23505";
}

export function registerProviderRoutes(parent: Router) {
  const router = Router();
  parent.use("/provider", router);

  router.post("/register", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const existing = await getProviderForUser(userId);
      if (existing) return res.status(409).json({ error: "Provider account already exists", provider: existing });

      const schema = z.object({
        businessName: z.string().min(1).max(200),
        type: z.enum(["CLEANING_COMPANY", "PERSONAL_ASSISTANT", "HANDYMAN", "LANDSCAPER", "POOL_SERVICE", "PET_CARE", "MEAL_PREP", "ORGANIZING", "OTHER"]),
        email: z.string().email().max(255),
        phone: z.string().max(20).optional(),
        description: z.string().optional(),
        website: z.string().max(255).optional(),
        address: z.string().optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(50).optional(),
        postalCode: z.string().max(20).optional(),
        serviceRadius: z.number().int().optional(),
      });

      const data = schema.parse(req.body);
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      const [provider] = await db.insert(serviceProviders).values({
        ...data,
        ownerId: userId,
        trialEndsAt: trialEnd,
      }).returning();

      await db.insert(providerStaff).values({
        providerId: provider.id,
        userId,
        firstName: data.businessName,
        lastName: "(Owner)",
        email: data.email,
        role: "OWNER",
      });

      res.status(201).json(provider);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Provider registration failed", { error: err });
      res.status(500).json({ error: "Registration failed" });
    }
  });

  router.get("/me", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      res.json((req as any).provider);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch provider" });
    }
  });

  router.patch("/me", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const allowedFields: (keyof InsertServiceProvider)[] = [
        "businessName", "description", "phone", "website", "address", "city", "state",
        "postalCode", "serviceRadius", "businessLicense", "insuranceProvider",
        "insurancePolicyNumber", "insuranceExpires", "bondAmount", "settings"
      ];
      const updates: Partial<InsertServiceProvider> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) (updates as Record<string, unknown>)[field] = req.body[field];
      }
      updates.updatedAt = new Date();

      const [updated] = await db.update(serviceProviders)
        .set(updates)
        .where(eq(serviceProviders.id, providerId))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      logger.error("Provider update failed", { error: err });
      res.status(500).json({ error: "Update failed" });
    }
  });

  router.get("/dashboard", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;

      const [clientStats] = await db.select({
        total: count(),
        active: sql<number>`count(*) filter (where ${providerClients.status} = 'ACTIVE')`,
      }).from(providerClients).where(eq(providerClients.providerId, providerId));

      const [staffStats] = await db.select({
        total: count(),
        active: sql<number>`count(*) filter (where ${providerStaff.isActive} = true)`,
      }).from(providerStaff).where(eq(providerStaff.providerId, providerId));

      const today = new Date().toISOString().split("T")[0];
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);

      const [scheduleStats] = await db.select({
        todayCount: sql<number>`count(*) filter (where ${providerSchedule.scheduledDate} = ${today})`,
        weekCount: sql<number>`count(*) filter (where ${providerSchedule.scheduledDate} >= ${today} and ${providerSchedule.scheduledDate} <= ${weekEnd.toISOString().split("T")[0]})`,
        completedThisMonth: sql<number>`count(*) filter (where ${providerSchedule.status} = 'COMPLETED' and ${providerSchedule.scheduledDate} >= date_trunc('month', current_date)::text)`,
      }).from(providerSchedule).where(eq(providerSchedule.providerId, providerId));

      const upcomingSchedule = await db.select().from(providerSchedule)
        .where(and(
          eq(providerSchedule.providerId, providerId),
          gte(providerSchedule.scheduledDate, today),
        ))
        .orderBy(asc(providerSchedule.scheduledDate))
        .limit(10);

      res.json({
        clients: clientStats,
        staff: staffStats,
        schedule: scheduleStats,
        upcoming: upcomingSchedule,
        provider: (req as any).provider,
      });
    } catch (err: unknown) {
      logger.error("Dashboard fetch failed", { error: err });
      res.status(500).json({ error: "Dashboard failed" });
    }
  });

  router.get("/clients", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const clients = await db.select().from(providerClients)
        .where(eq(providerClients.providerId, providerId))
        .orderBy(desc(providerClients.createdAt));
      res.json(clients);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  router.post("/clients", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const schema = z.object({
        householdId: z.string().min(1),
        startDate: z.string().min(1),
        serviceFrequency: z.string().optional(),
        preferredDay: z.string().optional(),
        preferredTime: z.string().optional(),
        baseRateCents: z.number().int().optional(),
        estimatedHours: z.string().optional(),
        assignedStaffId: z.string().optional(),
        clientNotes: z.string().optional(),
        accessInstructions: z.string().optional(),
      });

      const data = schema.parse(req.body);

      const provider = (req as any).provider;
      const tier = provider.subscriptionTier?.toUpperCase() || "STARTER";
      const tierLimits: Record<string, number | null> = { STARTER: 5, FREE: 5, PRO: null, PREMIUM: null };
      const maxClients = tierLimits[tier] ?? 5;
      if (maxClients !== null) {
        const [clientCount] = await db.select({ total: count() })
          .from(providerClients)
          .where(and(eq(providerClients.providerId, providerId), eq(providerClients.status, "ACTIVE")));
        if ((clientCount?.total || 0) >= maxClients) {
          return res.status(403).json({
            error: `Client limit reached for ${tier} tier (max ${maxClients}). Upgrade to add more clients.`,
            tier,
            maxClients,
            currentClients: clientCount?.total || 0,
          });
        }
      }

      const [household] = await db.select({ id: households.id }).from(households)
        .where(eq(households.id, data.householdId));
      if (!household) return res.status(404).json({ error: "Household not found" });
      const [vendorLink] = await db.select({ id: vendors.id }).from(vendors)
        .where(and(
          eq(vendors.householdId, data.householdId),
          eq(vendors.email, provider.email),
        ));
      if (!vendorLink) {
        return res.status(403).json({
          error: "Not authorized to link to this household. You must be added as a vendor by the household first.",
        });
      }

      const [client] = await db.insert(providerClients).values({
        ...data,
        providerId,
      }).returning();

      await db.update(serviceProviders)
        .set({ totalClients: sql`${serviceProviders.totalClients} + 1`, updatedAt: new Date() })
        .where(eq(serviceProviders.id, providerId));

      res.status(201).json(client);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      if (isDbConstraintError(err)) return res.status(409).json({ error: "Client relationship already exists" });
      logger.error("Client creation failed", { error: err });
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  router.get("/clients/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const [client] = await db.select().from(providerClients)
        .where(and(eq(providerClients.id, req.params.id), eq(providerClients.providerId, providerId)));
      if (!client) return res.status(404).json({ error: "Client not found" });

      const schedule = await db.select().from(providerSchedule)
        .where(eq(providerSchedule.providerClientId, client.id))
        .orderBy(desc(providerSchedule.scheduledDate))
        .limit(20);

      res.json({ client, schedule });
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  router.patch("/clients/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const allowedFields: (keyof ProviderClient)[] = ["status", "serviceFrequency", "preferredDay", "preferredTime",
        "baseRateCents", "estimatedHours", "assignedStaffId", "clientNotes", "accessInstructions", "endDate"];
      const updates: Partial<ProviderClient> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) (updates as Record<string, unknown>)[field] = req.body[field];
      }
      updates.updatedAt = new Date();

      const [updated] = await db.update(providerClients)
        .set(updates)
        .where(and(eq(providerClients.id, req.params.id), eq(providerClients.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Client not found" });
      res.json(updated);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  router.get("/staff", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const staff = await db.select().from(providerStaff)
        .where(eq(providerStaff.providerId, providerId))
        .orderBy(desc(providerStaff.createdAt));
      res.json(staff);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  router.post("/staff", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const schema = z.object({
        firstName: z.string().min(1).max(50),
        lastName: z.string().min(1).max(50),
        email: z.string().email().max(255).optional(),
        phone: z.string().max(20).optional(),
        role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
        hourlyRate: z.number().int().optional(),
        hireDate: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const [member] = await db.insert(providerStaff).values({
        ...data,
        providerId,
      }).returning();

      res.status(201).json(member);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Staff creation failed", { error: err });
      res.status(500).json({ error: "Failed to create staff" });
    }
  });

  router.patch("/staff/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const allowedFields: (keyof ProviderStaffType)[] = ["firstName", "lastName", "email", "phone", "role", "hourlyRate", "isActive", "permissions"];
      const updates: Partial<ProviderStaffType> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) (updates as Record<string, unknown>)[field] = req.body[field];
      }

      const [updated] = await db.update(providerStaff)
        .set(updates)
        .where(and(eq(providerStaff.id, req.params.id), eq(providerStaff.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Staff member not found" });
      res.json(updated);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to update staff" });
    }
  });

  router.delete("/staff/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const [deleted] = await db.update(providerStaff)
        .set({ isActive: false })
        .where(and(eq(providerStaff.id, req.params.id), eq(providerStaff.providerId, providerId)))
        .returning();

      if (!deleted) return res.status(404).json({ error: "Staff member not found" });
      res.json({ message: "Staff member deactivated" });
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to deactivate staff" });
    }
  });

  router.get("/schedule", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const { startDate, endDate, staffId, status } = req.query;

      let conditions = [eq(providerSchedule.providerId, providerId)];
      if (startDate) conditions.push(gte(providerSchedule.scheduledDate, startDate as string));
      if (endDate) conditions.push(lte(providerSchedule.scheduledDate, endDate as string));
      if (staffId) conditions.push(eq(providerSchedule.staffId, staffId as string));
      if (status) conditions.push(eq(providerSchedule.status, status as string));

      const schedule = await db.select().from(providerSchedule)
        .where(and(...conditions))
        .orderBy(asc(providerSchedule.scheduledDate));

      res.json(schedule);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  router.post("/schedule", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const schema = z.object({
        providerClientId: z.string().min(1),
        staffId: z.string().optional(),
        scheduledDate: z.string().min(1),
        scheduledTime: z.string().optional(),
        estimatedDuration: z.number().int().optional(),
        providerNotes: z.string().optional(),
      });

      const data = schema.parse(req.body);

      const [client] = await db.select().from(providerClients)
        .where(and(eq(providerClients.id, data.providerClientId), eq(providerClients.providerId, providerId)));
      if (!client) return res.status(404).json({ error: "Client not found" });

      const [entry] = await db.insert(providerSchedule).values({
        ...data,
        providerId,
      }).returning();

      res.status(201).json(entry);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Schedule creation failed", { error: err });
      res.status(500).json({ error: "Failed to create schedule entry" });
    }
  });

  router.patch("/schedule/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const allowedFields: (keyof ProviderScheduleItem)[] = ["staffId", "scheduledDate", "scheduledTime", "estimatedDuration",
        "status", "arrivedAt", "completedAt", "providerNotes", "clientNotes"];
      const updates: Partial<ProviderScheduleItem> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) (updates as Record<string, unknown>)[field] = req.body[field];
      }

      const [updated] = await db.update(providerSchedule)
        .set(updates)
        .where(and(eq(providerSchedule.id, req.params.id), eq(providerSchedule.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Schedule entry not found" });
      res.json(updated);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  router.delete("/schedule/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const [updated] = await db.update(providerSchedule)
        .set({ status: "CANCELLED" })
        .where(and(eq(providerSchedule.id, req.params.id), eq(providerSchedule.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Schedule entry not found" });
      res.json({ message: "Schedule entry cancelled" });
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to cancel schedule entry" });
    }
  });

  router.get("/invoices", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;

      const completedVisits = await db.select({
        id: providerSchedule.id,
        clientId: providerSchedule.providerClientId,
        scheduledDate: providerSchedule.scheduledDate,
        arrivedAt: providerSchedule.arrivedAt,
        completedAt: providerSchedule.completedAt,
        staffId: providerSchedule.staffId,
      }).from(providerSchedule)
        .where(and(
          eq(providerSchedule.providerId, providerId),
          eq(providerSchedule.status, "COMPLETED"),
        ))
        .orderBy(desc(providerSchedule.scheduledDate));

      const clients = await db.select().from(providerClients)
        .where(eq(providerClients.providerId, providerId));

      const clientMap = new Map(clients.map(c => [c.id, c]));

      const invoiceData = completedVisits.map(visit => {
        const client = clientMap.get(visit.clientId);
        return {
          ...visit,
          clientRate: client?.baseRateCents || 0,
          estimatedHours: client?.estimatedHours || "0",
        };
      });

      res.json(invoiceData);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch invoice data" });
    }
  });

  router.get("/leads", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      res.json({
        leads: [],
        message: "Marketplace leads coming soon. Complete your profile and get verified to appear in the provider directory.",
      });
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  const TIER_LIMITS: Record<string, { maxClients: number | null; feePercent: number }> = {
    STARTER: { maxClients: 5, feePercent: 15 },
    FREE: { maxClients: 5, feePercent: 15 },
    PRO: { maxClients: null, feePercent: 12 },
    PREMIUM: { maxClients: null, feePercent: 10 },
  };

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 180);
  }

  async function makeUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let attempt = 0;
    while (true) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
      const [existing] = await db.select({ id: providerProfiles.id })
        .from(providerProfiles)
        .where(eq(providerProfiles.slug, candidate));
      if (!existing) return candidate;
      attempt++;
      if (attempt > 100) return `${slug}-${Date.now()}`;
    }
  }

  function getTierLimits(tier: string) {
    return TIER_LIMITS[tier?.toUpperCase()] || TIER_LIMITS.STARTER;
  }

  router.get("/profile", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const provider = (req as any).provider;
      const [profile] = await db.select().from(providerProfiles)
        .where(eq(providerProfiles.providerId, provider.id));

      const tierInfo = getTierLimits(provider.subscriptionTier || "STARTER");

      res.json({
        profile: profile || null,
        provider,
        tier: {
          name: (provider.subscriptionTier || "STARTER").toUpperCase(),
          maxClients: tierInfo.maxClients,
          feePercent: tierInfo.feePercent,
          currentClients: provider.totalClients || 0,
          canAddClients: tierInfo.maxClients === null || (provider.totalClients || 0) < tierInfo.maxClients,
        },
      });
    } catch (err: unknown) {
      logger.error("Failed to fetch provider profile", { error: err });
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  const profileSchema = z.object({
    displayName: z.string().min(1).max(200),
    tagline: z.string().max(300).optional(),
    description: z.string().optional(),
    profilePhotoUrl: z.string().optional(),
    coverPhotoUrl: z.string().optional(),
    galleryPhotos: z.array(z.string()).optional(),
    serviceAreas: z.array(z.object({
      postalCode: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      radius: z.number().optional(),
    })).optional(),
    servicesOffered: z.array(z.object({
      category: z.string(),
      name: z.string(),
      description: z.string().optional(),
      priceRange: z.string().optional(),
      duration: z.string().optional(),
    })).optional(),
    availability: z.object({
      leadTimeDays: z.number().optional(),
      sameDay: z.boolean().optional(),
      weekends: z.boolean().optional(),
      evenings: z.boolean().optional(),
    }).optional(),
    isAcceptingClients: z.boolean().optional(),
    isPublic: z.boolean().optional(),
  });

  router.post("/profile", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const provider = (req as any).provider;

      const [existing] = await db.select({ id: providerProfiles.id })
        .from(providerProfiles)
        .where(eq(providerProfiles.providerId, provider.id));
      if (existing) return res.status(409).json({ error: "Profile already exists. Use PATCH to update." });

      const data = profileSchema.parse(req.body);
      const baseSlug = generateSlug(data.displayName || provider.businessName);
      const slug = await makeUniqueSlug(baseSlug);

      const [profile] = await db.insert(providerProfiles).values({
        providerId: provider.id,
        slug,
        displayName: data.displayName,
        tagline: data.tagline,
        description: data.description,
        profilePhotoUrl: data.profilePhotoUrl,
        coverPhotoUrl: data.coverPhotoUrl,
        galleryPhotos: data.galleryPhotos,
        serviceAreas: data.serviceAreas,
        servicesOffered: data.servicesOffered,
        availability: data.availability,
        isAcceptingClients: data.isAcceptingClients ?? true,
        isPublic: data.isPublic ?? false,
      }).returning();

      res.status(201).json(profile);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      if (isDbConstraintError(err)) return res.status(409).json({ error: "Profile already exists" });
      logger.error("Profile creation failed", { error: err });
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  router.patch("/profile", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const provider = (req as any).provider;

      const [existing] = await db.select().from(providerProfiles)
        .where(eq(providerProfiles.providerId, provider.id));
      if (!existing) return res.status(404).json({ error: "No profile found. Use POST to create one." });

      const updateSchema = profileSchema.partial();
      const data = updateSchema.parse(req.body);

      const updates: Partial<InsertProviderProfile> = {};
      const allowedFields = [
        "displayName", "tagline", "description", "profilePhotoUrl", "coverPhotoUrl",
        "galleryPhotos", "serviceAreas", "servicesOffered", "availability",
        "isAcceptingClients", "isPublic",
      ] as const;

      for (const field of allowedFields) {
        if ((data as any)[field] !== undefined) (updates as any)[field] = (data as any)[field];
      }

      if (data.displayName && data.displayName !== existing.displayName) {
        const baseSlug = generateSlug(data.displayName);
        updates.slug = await makeUniqueSlug(baseSlug);
      }

      updates.updatedAt = new Date();

      const [updated] = await db.update(providerProfiles)
        .set(updates)
        .where(eq(providerProfiles.providerId, provider.id))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Profile update failed", { error: err });
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  router.get("/tier", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const provider = (req as any).provider;
      const tierInfo = getTierLimits(provider.subscriptionTier || "STARTER");

      const [clientCount] = await db.select({ total: count() })
        .from(providerClients)
        .where(and(
          eq(providerClients.providerId, provider.id),
          eq(providerClients.status, "ACTIVE"),
        ));

      const currentClients = clientCount?.total || 0;

      res.json({
        tier: (provider.subscriptionTier || "STARTER").toUpperCase(),
        subscriptionStatus: provider.subscriptionStatus || "TRIAL",
        trialEndsAt: provider.trialEndsAt,
        maxClients: tierInfo.maxClients,
        feePercent: tierInfo.feePercent,
        currentClients,
        canAddClients: tierInfo.maxClients === null || currentClients < tierInfo.maxClients,
        atLimit: tierInfo.maxClients !== null && currentClients >= tierInfo.maxClients,
      });
    } catch (err: unknown) {
      logger.error("Failed to fetch tier info", { error: err });
      res.status(500).json({ error: "Failed to fetch tier info" });
    }
  });

  router.get("/featured-status", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const provider = (req as any).provider;
      const [profile] = await db.select({
        featuredUntil: providerProfiles.featuredUntil,
        isPublic: providerProfiles.isPublic,
        verificationStatus: providerProfiles.verificationStatus,
      }).from(providerProfiles)
        .where(eq(providerProfiles.providerId, provider.id));

      if (!profile) return res.status(404).json({ error: "No profile found" });

      const now = new Date();
      const isFeatured = profile.featuredUntil ? new Date(profile.featuredUntil) > now : false;

      res.json({
        isFeatured,
        featuredUntil: profile.featuredUntil,
        isPublic: profile.isPublic,
        verificationStatus: profile.verificationStatus,
        sponsoredLabel: isFeatured ? "Sponsored" : null,
      });
    } catch (err: unknown) {
      logger.error("Failed to fetch featured status", { error: err });
      res.status(500).json({ error: "Failed to fetch featured status" });
    }
  });

  router.patch("/reviews/:id/respond", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;

      const responseSchema = z.object({
        response: z.string().min(1).max(1000),
      });

      const { response } = responseSchema.parse(req.body);

      const [review] = await db.select().from(marketplaceReviews)
        .where(and(
          eq(marketplaceReviews.id, req.params.id),
          eq(marketplaceReviews.providerId, providerId),
        ));

      if (!review) return res.status(404).json({ error: "Review not found" });

      if (review.providerResponse) {
        return res.status(409).json({ error: "You have already responded to this review" });
      }

      const [updated] = await db.update(marketplaceReviews)
        .set({
          providerResponse: response,
          providerRespondedAt: new Date(),
        })
        .where(eq(marketplaceReviews.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Failed to respond to review", { error: err });
      res.status(500).json({ error: "Failed to respond to review" });
    }
  });

  router.get("/booking-requests", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;
      const { status, limit: limitStr, offset: offsetStr } = req.query;
      const limit = Math.min(parseInt(limitStr as string) || 20, 100);
      const offset = parseInt(offsetStr as string) || 0;

      let conditions = [eq(bookingRequests.providerId, providerId)];
      if (status && typeof status === "string") {
        conditions.push(eq(bookingRequests.status, status as any));
      }

      const results = await db.select().from(bookingRequests)
        .where(and(...conditions))
        .orderBy(desc(bookingRequests.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        requests: results,
        pagination: { limit, offset },
      });
    } catch (err: unknown) {
      logger.error("Failed to fetch provider booking requests", { error: err });
      res.status(500).json({ error: "Failed to fetch booking requests" });
    }
  });

  router.patch("/booking-requests/:id/respond", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId as string;

      const respondSchema = z.object({
        action: z.enum(["accept", "decline"]),
        quotedPriceCents: z.number().int().min(0).optional(),
        providerNotes: z.string().max(2000).optional(),
        declineReason: z.string().max(500).optional(),
      });

      const data = respondSchema.parse(req.body);

      const [booking] = await db.select().from(bookingRequests)
        .where(and(
          eq(bookingRequests.id, req.params.id),
          eq(bookingRequests.providerId, providerId),
        ));

      if (!booking) return res.status(404).json({ error: "Booking request not found" });
      if (booking.status !== "PENDING") {
        return res.status(400).json({ error: `Cannot respond to a ${booking.status.toLowerCase()} booking` });
      }

      if (data.action === "accept") {
        if (!data.quotedPriceCents && data.quotedPriceCents !== 0) {
          return res.status(400).json({ error: "quotedPriceCents is required when accepting" });
        }

        const provider = (req as any).provider;
        const tierInfo = getTierLimits(provider.subscriptionTier || "STARTER");
        const hndldFeeCents = Math.round(data.quotedPriceCents * (tierInfo.feePercent / 100));

        const [updated] = await db.update(bookingRequests)
          .set({
            status: "ACCEPTED",
            quotedPriceCents: data.quotedPriceCents,
            hndldFeeCents,
            providerNotes: data.providerNotes || null,
            providerResponseAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bookingRequests.id, req.params.id))
          .returning();

        return res.json(updated);
      } else {
        const [updated] = await db.update(bookingRequests)
          .set({
            status: "DECLINED",
            declineReason: data.declineReason || null,
            providerNotes: data.providerNotes || null,
            providerResponseAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bookingRequests.id, req.params.id))
          .returning();

        return res.json(updated);
      }
    } catch (err: unknown) {
      if (isZodError(err)) return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Booking response failed", { error: err });
      res.status(500).json({ error: "Failed to respond to booking" });
    }
  });
}
