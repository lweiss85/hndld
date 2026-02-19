import { Router, Request, Response } from "express";
import { db } from "../../db";
import {
  serviceProviders, providerStaff, providerClients, providerSchedule,
  vendors, households,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, count, asc } from "drizzle-orm";
import { isAuthenticated } from "../../replit_integrations/auth";
import logger from "../../lib/logger";
import { z } from "zod";

function getUserId(req: Request): string | null {
  return (req as any).user?.id || (req as any).userId || null;
}

async function getProviderForUser(userId: string) {
  const [provider] = await db.select().from(serviceProviders)
    .where(eq(serviceProviders.ownerId, userId));
  return provider || null;
}

function requireProvider(req: Request, res: Response, next: any) {
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

export function registerProviderRoutes(parent: any) {
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
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Provider registration failed", { error: err });
      res.status(500).json({ error: "Registration failed" });
    }
  });

  router.get("/me", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      res.json((req as any).provider);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch provider" });
    }
  });

  router.patch("/me", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const allowedFields = [
        "businessName", "description", "phone", "website", "address", "city", "state",
        "postalCode", "serviceRadius", "businessLicense", "insuranceProvider",
        "insurancePolicyNumber", "insuranceExpires", "bondAmount", "settings"
      ];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }
      updates.updatedAt = new Date();

      const [updated] = await db.update(serviceProviders)
        .set(updates)
        .where(eq(serviceProviders.id, providerId))
        .returning();

      res.json(updated);
    } catch (err) {
      logger.error("Provider update failed", { error: err });
      res.status(500).json({ error: "Update failed" });
    }
  });

  router.get("/dashboard", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;

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
    } catch (err) {
      logger.error("Dashboard fetch failed", { error: err });
      res.status(500).json({ error: "Dashboard failed" });
    }
  });

  router.get("/clients", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const clients = await db.select().from(providerClients)
        .where(eq(providerClients.providerId, providerId))
        .orderBy(desc(providerClients.createdAt));
      res.json(clients);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  router.post("/clients", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
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

      const [household] = await db.select({ id: households.id }).from(households)
        .where(eq(households.id, data.householdId));
      if (!household) return res.status(404).json({ error: "Household not found" });

      const provider = (req as any).provider;
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
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      if (err?.code === "23505") return res.status(409).json({ error: "Client relationship already exists" });
      logger.error("Client creation failed", { error: err });
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  router.get("/clients/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const [client] = await db.select().from(providerClients)
        .where(and(eq(providerClients.id, req.params.id), eq(providerClients.providerId, providerId)));
      if (!client) return res.status(404).json({ error: "Client not found" });

      const schedule = await db.select().from(providerSchedule)
        .where(eq(providerSchedule.providerClientId, client.id))
        .orderBy(desc(providerSchedule.scheduledDate))
        .limit(20);

      res.json({ client, schedule });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  router.patch("/clients/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const allowedFields = ["status", "serviceFrequency", "preferredDay", "preferredTime",
        "baseRateCents", "estimatedHours", "assignedStaffId", "clientNotes", "accessInstructions", "endDate"];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }
      updates.updatedAt = new Date();

      const [updated] = await db.update(providerClients)
        .set(updates)
        .where(and(eq(providerClients.id, req.params.id), eq(providerClients.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Client not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  router.get("/staff", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const staff = await db.select().from(providerStaff)
        .where(eq(providerStaff.providerId, providerId))
        .orderBy(desc(providerStaff.createdAt));
      res.json(staff);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  router.post("/staff", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
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
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Staff creation failed", { error: err });
      res.status(500).json({ error: "Failed to create staff" });
    }
  });

  router.patch("/staff/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const allowedFields = ["firstName", "lastName", "email", "phone", "role", "hourlyRate", "isActive", "permissions"];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      const [updated] = await db.update(providerStaff)
        .set(updates)
        .where(and(eq(providerStaff.id, req.params.id), eq(providerStaff.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Staff member not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update staff" });
    }
  });

  router.delete("/staff/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const [deleted] = await db.update(providerStaff)
        .set({ isActive: false })
        .where(and(eq(providerStaff.id, req.params.id), eq(providerStaff.providerId, providerId)))
        .returning();

      if (!deleted) return res.status(404).json({ error: "Staff member not found" });
      res.json({ message: "Staff member deactivated" });
    } catch (err) {
      res.status(500).json({ error: "Failed to deactivate staff" });
    }
  });

  router.get("/schedule", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
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
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  router.post("/schedule", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
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
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      logger.error("Schedule creation failed", { error: err });
      res.status(500).json({ error: "Failed to create schedule entry" });
    }
  });

  router.patch("/schedule/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const allowedFields = ["staffId", "scheduledDate", "scheduledTime", "estimatedDuration",
        "status", "arrivedAt", "completedAt", "providerNotes", "clientNotes"];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      const [updated] = await db.update(providerSchedule)
        .set(updates)
        .where(and(eq(providerSchedule.id, req.params.id), eq(providerSchedule.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Schedule entry not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  router.delete("/schedule/:id", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;
      const [updated] = await db.update(providerSchedule)
        .set({ status: "CANCELLED" })
        .where(and(eq(providerSchedule.id, req.params.id), eq(providerSchedule.providerId, providerId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Schedule entry not found" });
      res.json({ message: "Schedule entry cancelled" });
    } catch (err) {
      res.status(500).json({ error: "Failed to cancel schedule entry" });
    }
  });

  router.get("/invoices", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      const providerId = (req as any).providerId;

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
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch invoice data" });
    }
  });

  router.get("/leads", isAuthenticated, requireProvider, async (req: Request, res: Response) => {
    try {
      res.json({
        leads: [],
        message: "Marketplace leads coming soon. Complete your profile and get verified to appear in the provider directory.",
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });
}
