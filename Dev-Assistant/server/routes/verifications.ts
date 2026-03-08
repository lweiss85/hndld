import { Router, Request, Response } from "express";
import { db } from "../db";
import { taskVerifications, propertyRooms } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { processTrigger } from "../services/automation-engine";
import logger from "../lib/logger";

const router = Router();

router.post(
  "/verifications",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;

      const {
        relatedEntityType,
        relatedEntityId,
        playbookStepId,
        roomId,
        verificationType,
        acceptanceCriteria,
        verifierType,
        beforePhotoId,
        afterPhotoId,
        notes,
        metadata,
      } = req.body;

      if (!relatedEntityType || !relatedEntityId || !verificationType) {
        return res.status(400).json({
          error: "relatedEntityType, relatedEntityId, and verificationType are required",
        });
      }

      if (roomId) {
        const [room] = await db.select().from(propertyRooms)
          .where(and(eq(propertyRooms.id, roomId), eq(propertyRooms.householdId, householdId)))
          .limit(1);
        if (!room) {
          return res.status(400).json({ error: "Room not found in this household" });
        }
      }

      const [verification] = await db
        .insert(taskVerifications)
        .values({
          householdId,
          relatedEntityType,
          relatedEntityId,
          playbookStepId: playbookStepId || null,
          roomId: roomId || null,
          verificationType,
          acceptanceCriteria: acceptanceCriteria || null,
          verifierType: verifierType || "PROVIDER_SELF",
          beforePhotoId: beforePhotoId || null,
          afterPhotoId: afterPhotoId || null,
          notes: notes || null,
          metadata: metadata || {},
          verifiedBy: userId,
        })
        .returning();

      logger.info("Verification created", {
        verificationId: verification.id,
        householdId,
        entityType: relatedEntityType,
        entityId: relatedEntityId,
      });

      res.status(201).json({ verification });
    } catch (error: unknown) {
      logger.error("Failed to create verification", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to create verification" });
    }
  }
);

router.get(
  "/verifications",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { entityType, entityId, status } = req.query;

      const conditions = [eq(taskVerifications.householdId, householdId)];

      if (entityType) {
        conditions.push(eq(taskVerifications.relatedEntityType, entityType as string));
      }
      if (entityId) {
        conditions.push(eq(taskVerifications.relatedEntityId, entityId as string));
      }
      if (status) {
        conditions.push(eq(taskVerifications.status, status as typeof taskVerifications.status.enumValues[number]));
      }

      const verifications = await db
        .select()
        .from(taskVerifications)
        .where(and(...conditions))
        .orderBy(desc(taskVerifications.createdAt));

      res.json({ verifications });
    } catch (error: unknown) {
      logger.error("Failed to fetch verifications", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch verifications" });
    }
  }
);

router.patch(
  "/verifications/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { id } = req.params;
      const {
        status,
        score,
        afterPhotoId,
        notes,
        failureReason,
        metadata,
        verifierType,
      } = req.body;

      const [existing] = await db
        .select()
        .from(taskVerifications)
        .where(
          and(
            eq(taskVerifications.id, id),
            eq(taskVerifications.householdId, householdId)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Verification not found" });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (status !== undefined) updateData.status = status;
      if (score !== undefined) updateData.score = score;
      if (afterPhotoId !== undefined) updateData.afterPhotoId = afterPhotoId;
      if (notes !== undefined) updateData.notes = notes;
      if (failureReason !== undefined) updateData.failureReason = failureReason;
      if (metadata !== undefined) updateData.metadata = metadata;
      if (verifierType !== undefined) updateData.verifierType = verifierType;

      if (status && status !== existing.status) {
        updateData.verifiedAt = new Date();
        updateData.verifiedBy = req.user!.claims.sub;
      }

      const [updated] = await db
        .update(taskVerifications)
        .set(updateData)
        .where(eq(taskVerifications.id, id))
        .returning();

      if (status && status !== existing.status) {
        if (status === "FAILED") {
          processTrigger({
            type: "VERIFICATION_FAILED",
            householdId,
            data: {
              verificationId: updated.id,
              entityType: updated.relatedEntityType,
              entityId: updated.relatedEntityId,
              failureReason: updated.failureReason || "",
              roomId: updated.roomId || "",
            },
          }).catch(() => {});
        }

        if (status === "PASSED") {
          processTrigger({
            type: "VERIFICATION_PASSED",
            householdId,
            data: {
              verificationId: updated.id,
              entityType: updated.relatedEntityType,
              entityId: updated.relatedEntityId,
              roomId: updated.roomId || "",
              score: updated.score,
            },
          }).catch(() => {});

          const remaining = await db
            .select({ count: sql<number>`count(*)` })
            .from(taskVerifications)
            .where(
              and(
                eq(taskVerifications.householdId, householdId),
                eq(taskVerifications.relatedEntityType, updated.relatedEntityType),
                eq(taskVerifications.relatedEntityId, updated.relatedEntityId),
                eq(taskVerifications.status, "PENDING")
              )
            );

          const pendingCount = Number(remaining[0]?.count || 0);
          if (pendingCount === 0) {
            processTrigger({
              type: "ALL_VERIFICATIONS_COMPLETE",
              householdId,
              data: {
                entityType: updated.relatedEntityType,
                entityId: updated.relatedEntityId,
              },
            }).catch(() => {});
          }
        }
      }

      res.json({ verification: updated });
    } catch (error: unknown) {
      logger.error("Failed to update verification", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update verification" });
    }
  }
);

router.get(
  "/verifications/summary",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { entityId, entityType } = req.query;

      if (!entityId) {
        return res.status(400).json({ error: "entityId is required" });
      }

      const conditions = [
        eq(taskVerifications.householdId, householdId),
        eq(taskVerifications.relatedEntityId, entityId as string),
      ];

      if (entityType) {
        conditions.push(eq(taskVerifications.relatedEntityType, entityType as string));
      }

      const results = await db
        .select({
          status: taskVerifications.status,
          count: sql<number>`count(*)`,
          avgScore: sql<number>`avg(${taskVerifications.score})`,
        })
        .from(taskVerifications)
        .where(and(...conditions))
        .groupBy(taskVerifications.status);

      const summary: Record<string, { count: number; avgScore: number | null }> = {};
      let total = 0;
      for (const row of results) {
        summary[row.status] = {
          count: Number(row.count),
          avgScore: row.avgScore ? Number(Number(row.avgScore).toFixed(1)) : null,
        };
        total += Number(row.count);
      }

      const passed = summary["PASSED"]?.count || 0;
      const failed = summary["FAILED"]?.count || 0;
      const pending = summary["PENDING"]?.count || 0;

      res.json({
        entityId,
        total,
        passed,
        failed,
        pending,
        skipped: summary["SKIPPED"]?.count || 0,
        needsReview: summary["NEEDS_REVIEW"]?.count || 0,
        passRate: total > 0 ? Number(((passed / (passed + failed)) * 100).toFixed(1)) || 0 : 0,
        avgScore: summary["PASSED"]?.avgScore || null,
        isComplete: pending === 0 && total > 0,
        byStatus: summary,
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch verification summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch verification summary" });
    }
  }
);

export function registerVerificationRoutes(app: Router) {
  app.use(router);
}
