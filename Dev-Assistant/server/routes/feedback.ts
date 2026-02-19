import { Router, Request, Response } from "express";
import { db } from "../db";
import { feedback, feedbackReplies } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";
import multer from "multer";
import sharp from "sharp";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs/promises";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images allowed") as any);
    }
  },
});

router.post(
  "/feedback",
  isAuthenticated,
  householdContextMiddleware,
  upload.single("screenshot"),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId;
      const { type, subject, description, pageUrl, appVersion } = req.body;

      if (!type || !subject || !description) {
        return res.status(400).json({ error: "Type, subject, and description are required" });
      }

      let screenshotUrl: string | undefined;

      if (req.file) {
        const filename = `feedback-${nanoid()}.webp`;
        const filepath = path.join(process.cwd(), "uploads", "feedback", filename);

        await fs.mkdir(path.dirname(filepath), { recursive: true });

        await sharp(req.file.buffer)
          .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(filepath);

        screenshotUrl = `/api/v1/uploads/feedback/${filename}`;
      }

      const [newFeedback] = await db.insert(feedback).values({
        userId,
        householdId: householdId || null,
        type,
        subject,
        description,
        screenshotUrl,
        pageUrl,
        userAgent: req.headers["user-agent"],
        appVersion,
        status: "NEW",
      }).returning();

      logger.info("Feedback submitted", {
        feedbackId: newFeedback.id,
        type,
        userId,
      });

      res.status(201).json({
        success: true,
        message: "Thank you for your feedback!",
        feedbackId: newFeedback.id,
      });
    } catch (error: unknown) {
      logger.error("Feedback submission failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  }
);

router.get(
  "/feedback",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;

      const userFeedback = await db.select().from(feedback)
        .where(eq(feedback.userId, userId))
        .orderBy(desc(feedback.createdAt))
        .limit(50);

      res.json({ feedback: userFeedback });
    } catch (error: unknown) {
      logger.error("Failed to fetch feedback", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  }
);

router.get(
  "/feedback/:id",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const { id } = req.params;

      const [item] = await db.select().from(feedback)
        .where(and(eq(feedback.id, id), eq(feedback.userId, userId)))
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      const replies = await db.select().from(feedbackReplies)
        .where(eq(feedbackReplies.feedbackId, id))
        .orderBy(feedbackReplies.createdAt);

      res.json({ feedback: item, replies });
    } catch (error: unknown) {
      logger.error("Failed to fetch feedback detail", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  }
);

router.post(
  "/feedback/:id/reply",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const { id } = req.params;
      const { message } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      const [item] = await db.select().from(feedback)
        .where(and(eq(feedback.id, id), eq(feedback.userId, userId)))
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      const [reply] = await db.insert(feedbackReplies).values({
        feedbackId: id,
        userId,
        isAdmin: false,
        message: message.trim(),
      }).returning();

      res.status(201).json({ reply });
    } catch (error: unknown) {
      logger.error("Failed to add reply", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to add reply" });
    }
  }
);

router.get(
  "/feedback/admin/all",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await db.query.userProfiles.findFirst({
        where: (p, { eq }) => eq(p.userId, userId),
      });

      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ error: "Only assistants can manage feedback" });
      }

      const status = req.query.status as string | undefined;
      const allFeedback = status
        ? await db.select().from(feedback)
            .where(eq(feedback.status, status as any))
            .orderBy(desc(feedback.createdAt))
            .limit(100)
        : await db.select().from(feedback)
            .orderBy(desc(feedback.createdAt))
            .limit(100);

      res.json({ feedback: allFeedback });
    } catch (error: unknown) {
      logger.error("Failed to fetch all feedback", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  }
);

router.patch(
  "/feedback/:id/status",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await db.query.userProfiles.findFirst({
        where: (p, { eq }) => eq(p.userId, userId),
      });

      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ error: "Only assistants can update feedback status" });
      }

      const { id } = req.params;
      const { status, adminNotes } = req.body;

      if (!status || !["NEW", "REVIEWED", "IN_PROGRESS", "RESOLVED", "WONT_FIX"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updates: Record<string, any> = {
        status,
        updatedAt: new Date(),
      };
      if (adminNotes !== undefined) updates.adminNotes = adminNotes;
      if (status === "RESOLVED") updates.resolvedAt = new Date();

      const [updated] = await db.update(feedback)
        .set(updates)
        .where(eq(feedback.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      logger.info("Feedback status updated", { feedbackId: id, status, userId });
      res.json({ feedback: updated });
    } catch (error: unknown) {
      logger.error("Failed to update feedback status", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update feedback" });
    }
  }
);

router.post(
  "/feedback/:id/admin-reply",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await db.query.userProfiles.findFirst({
        where: (p, { eq }) => eq(p.userId, userId),
      });

      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ error: "Only assistants can reply as support" });
      }

      const { id } = req.params;
      const { message } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      const [item] = await db.select().from(feedback)
        .where(eq(feedback.id, id))
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      const [reply] = await db.insert(feedbackReplies).values({
        feedbackId: id,
        userId,
        isAdmin: true,
        message: message.trim(),
      }).returning();

      await db.update(feedback)
        .set({ status: "REVIEWED", updatedAt: new Date() })
        .where(and(eq(feedback.id, id), eq(feedback.status, "NEW")));

      logger.info("Admin replied to feedback", { feedbackId: id, userId });
      res.status(201).json({ reply });
    } catch (error: unknown) {
      logger.error("Failed to add admin reply", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to add reply" });
    }
  }
);

export function registerFeedbackRoutes(app: Router) {
  app.use(router);
}
