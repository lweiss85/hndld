import { Router, Request, NextFunction } from "express";
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
import { badRequest, notFound, internalError } from "../lib/errors";

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

/**
 * @openapi
 * /files/upload:
 *   post:
 *     summary: Upload a file
 *     description: Uploads a file to the household file storage. Supports images, PDFs, and office documents up to 10MB.
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               category:
 *                 type: string
 *                 default: OTHER
 *               tags:
 *                 type: string
 *                 description: JSON array of tag strings
 *               description:
 *                 type: string
 *               linkTo:
 *                 type: string
 *                 description: JSON object with entityType, entityId, and optional note
 *     responses:
 *       200:
 *         description: Uploaded file record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 *       400:
 *         description: No file provided or invalid file type
 *       500:
 *         description: Upload failed
 */
router.post("/upload", upload.single("file"), async (req: Request, res, next: NextFunction) => {
  try {
    if (!req.file) {
      throw badRequest("No file provided");
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
  } catch (error: unknown) {
    console.error("Upload error:", error);
    next(internalError(error instanceof Error ? error.message : "Upload failed"));
  }
});

/**
 * @openapi
 * /files:
 *   get:
 *     summary: List files
 *     description: Lists files in the household with optional filtering by category, tags, uploader, date range, and search query.
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - in: query
 *         name: uploadedBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list of files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/File'
 *                 total:
 *                   type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/", async (req: Request, res, next: NextFunction) => {
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
  } catch (error: unknown) {
    console.error("Error listing files:", error);
    next(internalError("Failed to list files"));
  }
});

/**
 * @openapi
 * /files/entity/{entityType}/{entityId}:
 *   get:
 *     summary: Get files linked to an entity
 *     description: Returns all files linked to a specific entity (e.g., task, approval).
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of files linked to the entity
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/File'
 *       500:
 *         description: Internal server error
 */
router.get("/entity/:entityType/:entityId", async (req: Request, res, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params;
    const entityFiles = await getEntityFiles(entityType, entityId);
    res.json(entityFiles);
  } catch (error: unknown) {
    console.error("Error getting entity files:", error);
    next(internalError("Failed to get entity files"));
  }
});

/**
 * @openapi
 * /files/meta/categories:
 *   get:
 *     summary: Get file categories
 *     description: Returns all distinct file categories used in the household.
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *     responses:
 *       200:
 *         description: List of category strings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Internal server error
 */
router.get("/meta/categories", async (req: Request, res, next: NextFunction) => {
  try {
    const householdId = req.householdId;
    
    const categories = await db
      .selectDistinct({ category: files.category })
      .from(files)
      .where(and(eq(files.householdId, householdId), isNull(files.deletedAt)));
    
    res.json(categories.map((c) => c.category));
  } catch (error: unknown) {
    console.error("Error getting categories:", error);
    next(internalError("Failed to get categories"));
  }
});

/**
 * @openapi
 * /files/meta/tags:
 *   get:
 *     summary: Get file tags
 *     description: Returns all distinct tags used across files in the household.
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *     responses:
 *       200:
 *         description: Sorted list of tag strings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Internal server error
 */
router.get("/meta/tags", async (req: Request, res, next: NextFunction) => {
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
  } catch (error: unknown) {
    console.error("Error getting tags:", error);
    next(internalError("Failed to get tags"));
  }
});

/**
 * @openapi
 * /files/{id}:
 *   get:
 *     summary: Get file details
 *     description: Returns file metadata and usage information. Also tracks a file view.
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File details with usage info
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/File'
 *                 - type: object
 *                   properties:
 *                     usage:
 *                       type: object
 *       404:
 *         description: File not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", async (req: Request, res, next: NextFunction) => {
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
      throw notFound("File not found");
    }
    
    await trackFileView(id);
    const usage = await getFileUsage(id);
    
    res.json({ ...file, usage });
  } catch (error: unknown) {
    console.error("Error getting file:", error);
    next(internalError("Failed to get file"));
  }
});

/**
 * @openapi
 * /files/{id}:
 *   patch:
 *     summary: Update file metadata
 *     description: Updates the category, tags, or description of a file.
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated file record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 *       404:
 *         description: File not found
 *       500:
 *         description: Internal server error
 */
router.patch("/:id", async (req: Request, res, next: NextFunction) => {
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
      throw notFound("File not found");
    }
    
    await updateFileMetadata(id, { category, tags, description });
    
    const [updated] = await db
      .select()
      .from(files)
      .where(eq(files.id, id))
      .limit(1);
    
    res.json(updated);
  } catch (error: unknown) {
    console.error("Error updating file:", error);
    next(internalError("Failed to update file"));
  }
});

/**
 * @openapi
 * /files/{id}:
 *   delete:
 *     summary: Soft-delete a file
 *     description: Marks a file and its entity links as deleted (soft delete).
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       404:
 *         description: File not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", async (req: Request, res, next: NextFunction) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId;
    
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.householdId, householdId)))
      .limit(1);
    
    if (!file) {
      throw notFound("File not found");
    }
    
    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
    await db.update(fileLinks).set({ deletedAt: new Date() }).where(eq(fileLinks.fileId, id));
    
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting file:", error);
    next(internalError("Failed to delete file"));
  }
});

/**
 * @openapi
 * /files/{id}/link:
 *   post:
 *     summary: Link file to an entity
 *     description: Creates a link between a file and an entity (e.g., task, approval).
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityId
 *             properties:
 *               entityType:
 *                 type: string
 *               entityId:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: File link created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: File not found
 *       500:
 *         description: Internal server error
 */
router.post("/:id/link", async (req: Request, res, next: NextFunction) => {
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
      throw notFound("File not found");
    }
    
    const link = await linkFileToEntity(id, entityType, entityId, userId, note);
    res.json(link);
  } catch (error: unknown) {
    console.error("Error linking file:", error);
    next(internalError("Failed to link file"));
  }
});

/**
 * @openapi
 * /files/{id}/link/{entityType}/{entityId}:
 *   delete:
 *     summary: Unlink file from an entity
 *     description: Removes the link between a file and a specific entity.
 *     tags:
 *       - Files
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File unlinked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       500:
 *         description: Internal server error
 */
router.delete("/:id/link/:entityType/:entityId", async (req: Request, res, next: NextFunction) => {
  try {
    const { id, entityType, entityId } = req.params;
    await unlinkFileFromEntity(id, entityType, entityId);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("Error unlinking file:", error);
    next(internalError("Failed to unlink file"));
  }
});

export default router;
