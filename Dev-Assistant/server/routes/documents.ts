import { Router, Request, Response } from "express";
import { db } from "../db";
import { trackedDocuments, notifications, userProfiles } from "@shared/schema";
import { eq, and, lte, gte, desc, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";

const router = Router();

router.get(
  "/documents",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId;
      if (!householdId) return res.status(400).json({ error: "No household context" });

      const typeFilter = req.query.type as string | undefined;
      const activeOnly = req.query.active !== "false";

      let conditions = [eq(trackedDocuments.householdId, householdId)];
      if (activeOnly) conditions.push(eq(trackedDocuments.isActive, true));
      if (typeFilter) conditions.push(eq(trackedDocuments.type, typeFilter as any));

      const docs = await db.select().from(trackedDocuments)
        .where(and(...conditions))
        .orderBy(trackedDocuments.expirationDate);

      res.json({ documents: docs });
    } catch (error: unknown) {
      logger.error("Failed to fetch documents", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  }
);

router.get(
  "/documents/expiring",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId;
      if (!householdId) return res.status(400).json({ error: "No household context" });

      const days = parseInt(req.query.days as string) || 90;
      const now = new Date();
      const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const docs = await db.select().from(trackedDocuments)
        .where(and(
          eq(trackedDocuments.householdId, householdId),
          eq(trackedDocuments.isActive, true),
          gte(trackedDocuments.expirationDate, now),
          lte(trackedDocuments.expirationDate, futureDate)
        ))
        .orderBy(trackedDocuments.expirationDate);

      res.json({ documents: docs });
    } catch (error: unknown) {
      logger.error("Failed to fetch expiring documents", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch expiring documents" });
    }
  }
);

router.get(
  "/documents/summary",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId;
      if (!householdId) return res.status(400).json({ error: "No household context" });

      const now = new Date();
      const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const allDocs = await db.select().from(trackedDocuments)
        .where(and(
          eq(trackedDocuments.householdId, householdId),
          eq(trackedDocuments.isActive, true)
        ));

      const byType: Record<string, number> = {};
      let totalAnnualCost = 0;
      let expiringSoon = 0;
      let expired = 0;

      for (const doc of allDocs) {
        byType[doc.type] = (byType[doc.type] || 0) + 1;
        if (doc.annualCost) totalAnnualCost += doc.annualCost;

        if (doc.expirationDate) {
          if (doc.expirationDate < now) {
            expired++;
          } else if (doc.expirationDate <= ninetyDays) {
            expiringSoon++;
          }
        }
      }

      res.json({
        total: allDocs.length,
        byType,
        totalAnnualCost,
        expiringSoon,
        expired,
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch documents summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  }
);

router.get(
  "/documents/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId;
      if (!householdId) return res.status(400).json({ error: "No household context" });

      const [doc] = await db.select().from(trackedDocuments)
        .where(and(
          eq(trackedDocuments.id, req.params.id),
          eq(trackedDocuments.householdId, householdId)
        ))
        .limit(1);

      if (!doc) return res.status(404).json({ error: "Document not found" });

      res.json({ document: doc });
    } catch (error: unknown) {
      logger.error("Failed to fetch document", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch document" });
    }
  }
);

router.post(
  "/documents",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId;
      const userId = req.user!.claims.sub;
      if (!householdId) return res.status(400).json({ error: "No household context" });

      const {
        name, type, description, provider, policyNumber,
        effectiveDate, expirationDate, renewalDate,
        annualCost, paymentFrequency, coverageAmount, deductible,
        documentFileId, alertDaysBefore, autoRenews,
        contactName, contactPhone, contactEmail, notes
      } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: "Name and type are required" });
      }

      const [doc] = await db.insert(trackedDocuments).values({
        householdId,
        name,
        type,
        description: description || null,
        provider: provider || null,
        policyNumber: policyNumber || null,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        renewalDate: renewalDate ? new Date(renewalDate) : null,
        annualCost: annualCost != null && annualCost !== "" ? parseInt(String(annualCost)) : null,
        paymentFrequency: paymentFrequency || null,
        coverageAmount: coverageAmount != null && coverageAmount !== "" ? parseInt(String(coverageAmount)) : null,
        deductible: deductible != null && deductible !== "" ? parseInt(String(deductible)) : null,
        documentFileId: documentFileId || null,
        alertDaysBefore: alertDaysBefore != null && alertDaysBefore !== "" ? parseInt(String(alertDaysBefore)) : 30,
        autoRenews: autoRenews || false,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        notes: notes || null,
        createdBy: userId,
      }).returning();

      logger.info("Document created", { documentId: doc.id, type, householdId });
      res.status(201).json({ document: doc });
    } catch (error: unknown) {
      logger.error("Failed to create document", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to create document" });
    }
  }
);

router.patch(
  "/documents/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId;
      if (!householdId) return res.status(400).json({ error: "No household context" });

      const [existing] = await db.select().from(trackedDocuments)
        .where(and(
          eq(trackedDocuments.id, req.params.id),
          eq(trackedDocuments.householdId, householdId)
        ))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Document not found" });

      const updates: Record<string, any> = { updatedAt: new Date() };
      const fields = [
        "name", "type", "description", "provider", "policyNumber",
        "paymentFrequency", "documentFileId", "autoRenews",
        "contactName", "contactPhone", "contactEmail", "notes", "isActive"
      ];

      for (const field of fields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      const dateFields = ["effectiveDate", "expirationDate", "renewalDate"];
      for (const field of dateFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field] ? new Date(req.body[field]) : null;
        }
      }

      const intFields = ["annualCost", "coverageAmount", "deductible", "alertDaysBefore"];
      for (const field of intFields) {
        if (req.body[field] !== undefined) {
          const val = req.body[field];
          updates[field] = val === null || val === "" ? null : parseInt(String(val));
        }
      }

      if (req.body.expirationDate) {
        updates.alertSent = false;
      }

      const [doc] = await db.update(trackedDocuments)
        .set(updates)
        .where(eq(trackedDocuments.id, req.params.id))
        .returning();

      logger.info("Document updated", { documentId: doc.id });
      res.json({ document: doc });
    } catch (error: unknown) {
      logger.error("Failed to update document", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update document" });
    }
  }
);

router.delete(
  "/documents/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId;
      if (!householdId) return res.status(400).json({ error: "No household context" });

      const [existing] = await db.select().from(trackedDocuments)
        .where(and(
          eq(trackedDocuments.id, req.params.id),
          eq(trackedDocuments.householdId, householdId)
        ))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Document not found" });

      await db.delete(trackedDocuments).where(eq(trackedDocuments.id, req.params.id));

      logger.info("Document deleted", { documentId: req.params.id });
      res.json({ success: true });
    } catch (error: unknown) {
      logger.error("Failed to delete document", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to delete document" });
    }
  }
);

export async function processDocumentExpiryAlerts(): Promise<void> {
  const now = new Date();

  const docs = await db.select().from(trackedDocuments)
    .where(and(
      eq(trackedDocuments.isActive, true),
      eq(trackedDocuments.alertSent, false),
    ));

  let alertCount = 0;

  for (const doc of docs) {
    if (!doc.expirationDate || !doc.alertDaysBefore) continue;

    const alertDate = new Date(doc.expirationDate.getTime() - doc.alertDaysBefore * 24 * 60 * 60 * 1000);
    if (now < alertDate) continue;

    const householdMembers = await db.select().from(userProfiles)
      .where(eq(userProfiles.householdId, doc.householdId));

    const daysLeft = Math.ceil((doc.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const expiryLabel = daysLeft < 0 ? `expired ${Math.abs(daysLeft)} days ago` : `expires in ${daysLeft} days`;

    for (const member of householdMembers) {
      await db.insert(notifications).values({
        householdId: doc.householdId,
        userId: member.userId,
        type: "DAILY_DIGEST",
        title: `${doc.name} ${expiryLabel}`,
        body: `Your ${doc.type.toLowerCase().replace(/_/g, " ")}${doc.provider ? ` from ${doc.provider}` : ""} ${expiryLabel}. Review and renew if needed.`,
        linkUrl: "/documents",
      });
    }

    await db.update(trackedDocuments)
      .set({ alertSent: true })
      .where(eq(trackedDocuments.id, doc.id));

    alertCount++;
  }

  if (alertCount > 0) {
    logger.info("[DocumentAlerts] Processed expiry alerts", { alertCount });
  }
}

export function registerDocumentRoutes(app: Router) {
  app.use(router);
}
