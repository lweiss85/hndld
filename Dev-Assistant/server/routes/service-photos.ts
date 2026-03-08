import { Router, Request, Response } from "express";
import multer from "multer";
import { db } from "../db";
import { serviceVisitPhotos, propertyRooms } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { uploadFile } from "../services/storage-provider";
import logger from "../lib/logger";

const router = Router();

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

router.post(
  "/service-photos",
  isAuthenticated,
  householdContextMiddleware,
  photoUpload.single("photo"),
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;

      if (!req.file) {
        return res.status(400).json({ error: "No photo provided" });
      }

      const { relatedEntityType, relatedEntityId, photoType, roomId, caption, tags, executorType } = req.body;

      if (!relatedEntityType || !relatedEntityId || !photoType) {
        return res.status(400).json({ error: "relatedEntityType, relatedEntityId, and photoType are required" });
      }

      if (roomId) {
        const [room] = await db.select().from(propertyRooms)
          .where(and(eq(propertyRooms.id, roomId), eq(propertyRooms.householdId, householdId)))
          .limit(1);
        if (!room) {
          return res.status(400).json({ error: "Room not found in this household" });
        }
      }

      const uploadResult = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);

      let thumbnailUrl: string | null = null;
      try {
        const sharp = (await import("sharp")).default;
        const thumbBuffer = await sharp(req.file.buffer)
          .resize(300, 300, { fit: "inside" })
          .jpeg({ quality: 70 })
          .toBuffer();
        const thumbResult = await uploadFile(thumbBuffer, `thumb_${req.file.originalname}`, "image/jpeg");
        thumbnailUrl = thumbResult.publicUrl;
      } catch {
        logger.warn("Sharp thumbnail generation failed, storing without thumbnail");
      }

      const parsedTags = tags ? (typeof tags === "string" ? JSON.parse(tags) : tags) : [];

      const [photo] = await db
        .insert(serviceVisitPhotos)
        .values({
          householdId,
          relatedEntityType,
          relatedEntityId,
          photoUrl: uploadResult.publicUrl,
          thumbnailUrl,
          photoType,
          roomId: roomId || null,
          caption: caption || null,
          tags: parsedTags,
          capturedBy: userId,
          executorType: executorType || "HUMAN",
          metadata: {
            width: uploadResult.width,
            height: uploadResult.height,
          },
        })
        .returning();

      logger.info("Service photo uploaded", { photoId: photo.id, householdId });
      res.status(201).json({ photo });
    } catch (error: unknown) {
      logger.error("Failed to upload service photo", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to upload service photo" });
    }
  }
);

router.get(
  "/service-photos",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { entityType, entityId, roomId, photoType } = req.query;

      const conditions = [eq(serviceVisitPhotos.householdId, householdId)];

      if (entityType) {
        conditions.push(eq(serviceVisitPhotos.relatedEntityType, entityType as string));
      }
      if (entityId) {
        conditions.push(eq(serviceVisitPhotos.relatedEntityId, entityId as string));
      }
      if (roomId) {
        conditions.push(eq(serviceVisitPhotos.roomId, roomId as string));
      }
      if (photoType) {
        conditions.push(eq(serviceVisitPhotos.photoType, photoType as typeof serviceVisitPhotos.photoType.enumValues[number]));
      }

      const photos = await db
        .select()
        .from(serviceVisitPhotos)
        .where(and(...conditions))
        .orderBy(desc(serviceVisitPhotos.capturedAt));

      const grouped: Record<string, Record<string, typeof photos>> = {};
      for (const photo of photos) {
        const roomKey = photo.roomId || "unassigned";
        const typeKey = photo.photoType;
        if (!grouped[roomKey]) grouped[roomKey] = {};
        if (!grouped[roomKey][typeKey]) grouped[roomKey][typeKey] = [];
        grouped[roomKey][typeKey].push(photo);
      }

      res.json({ photos, grouped });
    } catch (error: unknown) {
      logger.error("Failed to fetch service photos", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch service photos" });
    }
  }
);

router.patch(
  "/service-photos/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { id } = req.params;
      const { caption, tags, qualityScore, flaggedIssues } = req.body;

      const updateData: Record<string, unknown> = {};
      if (caption !== undefined) updateData.caption = caption;
      if (tags !== undefined) updateData.tags = tags;
      if (qualityScore !== undefined) updateData.qualityScore = qualityScore;
      if (flaggedIssues !== undefined) updateData.flaggedIssues = flaggedIssues;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const [photo] = await db
        .update(serviceVisitPhotos)
        .set(updateData)
        .where(and(eq(serviceVisitPhotos.id, id), eq(serviceVisitPhotos.householdId, householdId)))
        .returning();

      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      res.json({ photo });
    } catch (error: unknown) {
      logger.error("Failed to update service photo", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update service photo" });
    }
  }
);

router.get(
  "/service-photos/pairs",
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
        eq(serviceVisitPhotos.householdId, householdId),
        eq(serviceVisitPhotos.relatedEntityId, entityId as string),
      ];

      if (entityType) {
        conditions.push(eq(serviceVisitPhotos.relatedEntityType, entityType as string));
      }

      const photos = await db
        .select()
        .from(serviceVisitPhotos)
        .where(and(...conditions))
        .orderBy(serviceVisitPhotos.capturedAt);

      const roomPhotos: Record<string, { before: typeof photos; after: typeof photos }> = {};

      for (const photo of photos) {
        const roomKey = photo.roomId || "unassigned";
        if (!roomPhotos[roomKey]) {
          roomPhotos[roomKey] = { before: [], after: [] };
        }
        if (photo.photoType === "BEFORE") {
          roomPhotos[roomKey].before.push(photo);
        } else if (photo.photoType === "AFTER") {
          roomPhotos[roomKey].after.push(photo);
        }
      }

      const pairs: Array<{
        roomId: string;
        before: (typeof photos)[number] | null;
        after: (typeof photos)[number] | null;
      }> = [];

      for (const [roomKey, data] of Object.entries(roomPhotos)) {
        const maxLen = Math.max(data.before.length, data.after.length);
        for (let i = 0; i < maxLen; i++) {
          pairs.push({
            roomId: roomKey,
            before: data.before[i] || null,
            after: data.after[i] || null,
          });
        }
      }

      res.json({ pairs });
    } catch (error: unknown) {
      logger.error("Failed to fetch photo pairs", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch photo pairs" });
    }
  }
);

export function registerServicePhotoRoutes(app: Router) {
  app.use(router);
}
