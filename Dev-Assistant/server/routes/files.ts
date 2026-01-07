import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import { files, fileLinks } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  uploadFile,
  listFiles,
  getFileUsage,
  linkFileToEntity,
  unlinkFileFromEntity,
  getEntityFiles,
  trackFileView,
  updateFileMetadata,
} from "../services/storage-provider";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

router.post("/upload", upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }
    
    const { category = "OTHER", tags, description, linkTo } = req.body;
    const householdId = req.householdId;
    const userId = req.user.claims.sub;
    
    const uploadResult = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    
    const parsedTags = tags ? (typeof tags === "string" ? JSON.parse(tags) : tags) : [];
    
    const [file] = await db
      .insert(files)
      .values({
        householdId,
        uploadedBy: userId,
        filename: req.file.originalname,
        storedFilename: uploadResult.storedFilename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        storageProvider: uploadResult.storageProvider,
        storagePath: uploadResult.storagePath,
        publicUrl: uploadResult.publicUrl,
        thumbnailPath: uploadResult.thumbnailPath,
        width: uploadResult.width,
        height: uploadResult.height,
        category: category as any,
        tags: parsedTags,
        description,
      })
      .returning();
    
    if (linkTo) {
      const linkData = typeof linkTo === "string" ? JSON.parse(linkTo) : linkTo;
      const { entityType, entityId, note } = linkData;
      await linkFileToEntity(file.id, entityType, entityId, userId, note);
    }
    
    res.json(file);
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Upload failed" });
  }
});

router.get("/", async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const {
      category,
      search,
      tags,
      uploadedBy,
      startDate,
      endDate,
      limit = "50",
      offset = "0",
    } = req.query;
    
    const result = await listFiles(householdId, {
      category,
      search,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
      uploadedBy,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    
    res.json(result);
  } catch (error: any) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

router.get("/entity/:entityType/:entityId", async (req: any, res) => {
  try {
    const { entityType, entityId } = req.params;
    const entityFiles = await getEntityFiles(entityType, entityId);
    res.json(entityFiles);
  } catch (error: any) {
    console.error("Error getting entity files:", error);
    res.status(500).json({ error: "Failed to get entity files" });
  }
});

router.get("/meta/categories", async (req: any, res) => {
  try {
    const householdId = req.householdId;
    
    const categories = await db
      .selectDistinct({ category: files.category })
      .from(files)
      .where(and(eq(files.householdId, householdId), isNull(files.deletedAt)));
    
    res.json(categories.map((c) => c.category));
  } catch (error: any) {
    console.error("Error getting categories:", error);
    res.status(500).json({ error: "Failed to get categories" });
  }
});

router.get("/meta/tags", async (req: any, res) => {
  try {
    const householdId = req.householdId;
    
    const filesWithTags = await db
      .select({ tags: files.tags })
      .from(files)
      .where(and(eq(files.householdId, householdId), isNull(files.deletedAt)));
    
    const allTags = new Set<string>();
    filesWithTags.forEach((f) => {
      if (f.tags && Array.isArray(f.tags)) {
        f.tags.forEach((tag: string) => allTags.add(tag));
      }
    });
    
    res.json(Array.from(allTags).sort());
  } catch (error: any) {
    console.error("Error getting tags:", error);
    res.status(500).json({ error: "Failed to get tags" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId;
    
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, id),
          eq(files.householdId, householdId),
          isNull(files.deletedAt)
        )
      )
      .limit(1);
    
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    await trackFileView(id);
    const usage = await getFileUsage(id);
    
    res.json({ ...file, usage });
  } catch (error: any) {
    console.error("Error getting file:", error);
    res.status(500).json({ error: "Failed to get file" });
  }
});

router.patch("/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId;
    const { category, tags, description } = req.body;
    
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.householdId, householdId)))
      .limit(1);
    
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    await updateFileMetadata(id, { category, tags, description });
    
    const [updated] = await db
      .select()
      .from(files)
      .where(eq(files.id, id))
      .limit(1);
    
    res.json(updated);
  } catch (error: any) {
    console.error("Error updating file:", error);
    res.status(500).json({ error: "Failed to update file" });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId;
    
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.householdId, householdId)))
      .limit(1);
    
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
    await db.update(fileLinks).set({ deletedAt: new Date() }).where(eq(fileLinks.fileId, id));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

router.post("/:id/link", async (req: any, res) => {
  try {
    const { id } = req.params;
    const { entityType, entityId, note } = req.body;
    const userId = req.user.claims.sub;
    const householdId = req.householdId;
    
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, id),
          eq(files.householdId, householdId),
          isNull(files.deletedAt)
        )
      )
      .limit(1);
    
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const link = await linkFileToEntity(id, entityType, entityId, userId, note);
    res.json(link);
  } catch (error: any) {
    console.error("Error linking file:", error);
    res.status(500).json({ error: "Failed to link file" });
  }
});

router.delete("/:id/link/:entityType/:entityId", async (req: any, res) => {
  try {
    const { id, entityType, entityId } = req.params;
    await unlinkFileFromEntity(id, entityType, entityId);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error unlinking file:", error);
    res.status(500).json({ error: "Failed to unlink file" });
  }
});

export default router;
