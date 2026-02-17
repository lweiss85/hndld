import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { celebrations, handwrittenNotes } from "../../shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";

const householdContext = householdContextMiddleware;
import {
  runCelebrationCheck,
  getHouseholdSummary,
  generateShareableHtml,
} from "../services/celebrations";

export function registerCelebrationRoutes(router: Router) {
  router.get("/celebrations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).user?.id;
      if (!householdId || !userId) return res.status(400).json({ error: "Missing context" });

      await runCelebrationCheck(householdId, userId);

      const items = await db.select().from(celebrations)
        .where(and(
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId)
        ))
        .orderBy(desc(celebrations.triggeredAt))
        .limit(50);

      res.json(items);
    } catch (error: any) {
      console.error("Error fetching celebrations:", error);
      res.status(500).json({ error: "Failed to fetch celebrations" });
    }
  });

  router.get("/celebrations/active", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).user?.id;
      if (!householdId || !userId) return res.status(400).json({ error: "Missing context" });

      await runCelebrationCheck(householdId, userId);

      const items = await db.select().from(celebrations)
        .where(and(
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId),
          eq(celebrations.status, "ACTIVE")
        ))
        .orderBy(desc(celebrations.triggeredAt));

      res.json(items);
    } catch (error: any) {
      console.error("Error fetching active celebrations:", error);
      res.status(500).json({ error: "Failed to fetch active celebrations" });
    }
  });

  router.get("/celebrations/summary", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Missing context" });

      const summary = await getHouseholdSummary(householdId);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  router.patch("/celebrations/:id/seen", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).user?.id;
      const { id } = req.params;

      const [updated] = await db.update(celebrations)
        .set({ status: "SEEN", seenAt: new Date() })
        .where(and(
          eq(celebrations.id, id),
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId)
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Celebration not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking celebration seen:", error);
      res.status(500).json({ error: "Failed to update celebration" });
    }
  });

  router.patch("/celebrations/:id/dismiss", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).user?.id;
      const { id } = req.params;

      const [updated] = await db.update(celebrations)
        .set({ status: "DISMISSED" })
        .where(and(
          eq(celebrations.id, id),
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId)
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Celebration not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error dismissing celebration:", error);
      res.status(500).json({ error: "Failed to dismiss celebration" });
    }
  });

  router.patch("/celebrations/:id/share", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).user?.id;
      const { id } = req.params;

      const [celebration] = await db.select().from(celebrations)
        .where(and(
          eq(celebrations.id, id),
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId)
        ));

      if (!celebration) return res.status(404).json({ error: "Celebration not found" });

      let shareableHtml = celebration.shareableHtml;
      if (!shareableHtml) {
        shareableHtml = await generateShareableHtml({
          title: celebration.title,
          subtitle: celebration.subtitle || undefined,
          message: celebration.message,
          type: celebration.type,
          data: celebration.data as Record<string, unknown>,
        });
      }

      const [updated] = await db.update(celebrations)
        .set({ status: "SHARED", sharedAt: new Date(), shareableHtml })
        .where(and(
          eq(celebrations.id, id),
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId)
        ))
        .returning();

      res.json({ celebration: updated, shareableHtml });
    } catch (error: any) {
      console.error("Error sharing celebration:", error);
      res.status(500).json({ error: "Failed to share celebration" });
    }
  });

  router.get("/handwritten-notes", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Missing context" });

      const notes = await db.select().from(handwrittenNotes)
        .where(eq(handwrittenNotes.householdId, householdId))
        .orderBy(desc(handwrittenNotes.createdAt));

      res.json(notes);
    } catch (error: any) {
      console.error("Error fetching handwritten notes:", error);
      res.status(500).json({ error: "Failed to fetch handwritten notes" });
    }
  });

  router.patch("/handwritten-notes/:id/approve", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const { id } = req.params;
      const { recipientAddress } = req.body;

      const [updated] = await db.update(handwrittenNotes)
        .set({
          status: "APPROVED",
          recipientAddress: recipientAddress || undefined,
          updatedAt: new Date(),
        })
        .where(and(
          eq(handwrittenNotes.id, id),
          eq(handwrittenNotes.householdId, householdId)
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Note not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error approving note:", error);
      res.status(500).json({ error: "Failed to approve note" });
    }
  });
}
