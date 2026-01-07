# Complete Photo Upload & File Library System
## Photos, Attachments, & Centralized File Management for hndld

---

## 🎯 ENHANCED OVERVIEW

This guide implements **TWO interconnected systems**:

1. **Attachment System** - Files attached to specific entities (tasks, updates, spending)
2. **File Library** - Centralized folder for ALL files, accessible to both clients and assistants

### Key Features:
- 📸 **Attach photos** to tasks, updates, spending, requests
- 📁 **File Library** - Centralized storage browser
- 🔗 **Link existing files** from library to tasks/requests
- 📂 **Organize by categories** (Receipts, Documents, Photos, etc.)
- 🔍 **Search and filter** all files
- 👥 **Accessible to both** clients and assistants
- 🏷️ **Tag and categorize** files
- 📊 **Track file usage** (which tasks/requests use this file)

**Implementation Time:** 6-8 hours
**Priority:** CRITICAL (Differentiating feature)

---

## 📋 USER STORIES

### Assistant Stories:
1. "I take a receipt photo → it saves to Library → I attach it to spending entry"
2. "I browse Library → find old receipt → attach to new expense report"
3. "I upload all warranty documents to Library → client can find them anytime"
4. "I search Library for 'HVAC' → find all related maintenance records"

### Client Stories:
1. "I want to see all receipts from last month → browse Library → filter by receipts"
2. "I upload photo of broken tile → attach to request → assistant sees it immediately"
3. "I browse Library → find insurance card photo from 6 months ago"
4. "I search 'passport' → find family passports instantly"

---

## 🏗️ ENHANCED ARCHITECTURE

### Database Structure

```
attachments table (existing - files attached to things)
  └─ Links to tasks, updates, spending, requests

files table (NEW - master file library)
  ├─ All uploaded files live here FIRST
  ├─ Can be attached to multiple entities
  └─ Can exist standalone in library

file_links table (NEW - links files to entities)
  └─ Many-to-many relationship between files and entities
```

**Benefits:**
- Upload once, use many times
- Delete task but keep file
- See all places a file is used
- Centralized file management

---

## 📋 PART 1: ENHANCED DATABASE SCHEMA (20 minutes)

### New Architecture: Files + Links

**Update: `shared/schema.ts`**

```typescript
import { pgTable, varchar, integer, timestamp, text, boolean, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import crypto from "crypto";

// =============================================================================
// MASTER FILES TABLE - Central file library
// =============================================================================
export const files = pgTable("files", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: varchar("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  uploadedBy: varchar("uploaded_by").notNull(), // userId
  
  // File metadata
  filename: varchar("filename").notNull(), // Original filename
  storedFilename: varchar("stored_filename").notNull(), // UUID filename on disk/S3
  mimeType: varchar("mime_type").notNull(), // "image/jpeg", "application/pdf", etc.
  fileSize: integer("file_size").notNull(), // bytes
  
  // Storage location
  storageProvider: varchar("storage_provider").notNull().default("LOCAL"), // "LOCAL", "S3", "R2"
  storagePath: varchar("storage_path").notNull(), // Path on disk or S3 key
  publicUrl: varchar("public_url"), // CDN URL for quick access
  
  // Image-specific (if applicable)
  width: integer("width"), // Image width in pixels
  height: integer("height"), // Image height in pixels
  thumbnailPath: varchar("thumbnail_path"), // Path to thumbnail
  
  // Organization & Discovery
  category: varchar("category").notNull().default("OTHER"), // "RECEIPT", "DOCUMENT", "PHOTO", "VIDEO", "OTHER"
  tags: text("tags"), // JSON array of tags ["insurance", "medical", "2024"]
  description: text("description"), // User-provided description
  
  // Usage tracking
  linkedCount: integer("linked_count").default(0), // How many entities link to this
  viewCount: integer("view_count").default(0), // How many times viewed
  lastViewedAt: timestamp("last_viewed_at"), // When last viewed
  
  // Metadata
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  
  // Soft delete (keep files safe)
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  householdIdx: index("files_household_idx").on(table.householdId),
  categoryIdx: index("files_category_idx").on(table.category),
  uploadedByIdx: index("files_uploaded_by_idx").on(table.uploadedBy),
  deletedIdx: index("files_deleted_idx").on(table.deletedAt),
}));

// =============================================================================
// FILE LINKS TABLE - Links files to entities (tasks, updates, etc.)
// =============================================================================
export const fileLinks = pgTable("file_links", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  
  // What is this file linked to?
  entityType: varchar("entity_type").notNull(), // "TASK", "UPDATE", "SPENDING", "REQUEST", "PERSON", etc.
  entityId: varchar("entity_id").notNull(), // ID of the task, update, etc.
  
  // Who linked it?
  linkedBy: varchar("linked_by").notNull(), // userId
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  
  // Optional note about why this file is linked
  note: text("note"),
  
  // Soft delete
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  fileIdx: index("file_links_file_idx").on(table.fileId),
  entityIdx: index("file_links_entity_idx").on(table.entityType, table.entityId),
  deletedIdx: index("file_links_deleted_idx").on(table.deletedAt),
}));

// =============================================================================
// RELATIONS
// =============================================================================
export const filesRelations = relations(files, ({ one, many }) => ({
  household: one(households, {
    fields: [files.householdId],
    references: [households.id],
  }),
  links: many(fileLinks),
}));

export const fileLinksRelations = relations(fileLinks, ({ one }) => ({
  file: one(files, {
    fields: [fileLinks.fileId],
    references: [files.id],
  }),
}));

// =============================================================================
// UPDATE EXISTING TABLES - Add attachment counts
// =============================================================================

// Update tasks table
export const tasks = pgTable("tasks", {
  // ... existing fields
  attachmentCount: integer("attachment_count").default(0),
});

// Update updates table
export const updates = pgTable("updates", {
  // ... existing fields
  attachmentCount: integer("attachment_count").default(0),
});

// Update spending table
export const spending = pgTable("spending", {
  // ... existing fields
  primaryReceiptId: varchar("primary_receipt_id"), // Quick link to main receipt file
  attachmentCount: integer("attachment_count").default(0),
});

// Update requests table (if you have one)
export const requests = pgTable("requests", {
  // ... existing fields
  attachmentCount: integer("attachment_count").default(0),
});
```

### Run Migration

```bash
npm run db:push
```

---

## 📋 PART 2: BACKEND - ENHANCED STORAGE SERVICE (1 hour)

**Update: `server/services/storage-provider.ts`**

(Keep the existing upload/delete/get functions from previous guide, ADD these new functions:)

```typescript
// =============================================================================
// FILE LIBRARY FUNCTIONS
// =============================================================================

/**
 * List all files in library with filtering
 */
export async function listFiles(
  householdId: string,
  filters: {
    category?: string;
    search?: string;
    tags?: string[];
    uploadedBy?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ files: any[]; total: number }> {
  const conditions = [
    eq(files.householdId, householdId),
    isNull(files.deletedAt),
  ];
  
  if (filters.category) {
    conditions.push(eq(files.category, filters.category));
  }
  
  if (filters.uploadedBy) {
    conditions.push(eq(files.uploadedBy, filters.uploadedBy));
  }
  
  if (filters.startDate) {
    conditions.push(gte(files.uploadedAt, filters.startDate));
  }
  
  if (filters.endDate) {
    conditions.push(lte(files.uploadedAt, filters.endDate));
  }
  
  let query = db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.uploadedAt));
  
  // Get total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(files)
    .where(and(...conditions));
  const total = totalResult[0]?.count || 0;
  
  // Apply pagination
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  if (filters.offset) {
    query = query.offset(filters.offset);
  }
  
  const results = await query;
  
  // Filter by search term (filename or description)
  let filteredResults = results;
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredResults = results.filter(
      (f) =>
        f.filename.toLowerCase().includes(searchLower) ||
        f.description?.toLowerCase().includes(searchLower)
    );
  }
  
  // Filter by tags
  if (filters.tags && filters.tags.length > 0) {
    filteredResults = filteredResults.filter((f) => {
      if (!f.tags) return false;
      const fileTags = JSON.parse(f.tags);
      return filters.tags.some((tag) => fileTags.includes(tag));
    });
  }
  
  return {
    files: filteredResults,
    total,
  };
}

/**
 * Get file usage - where is this file linked?
 */
export async function getFileUsage(fileId: string) {
  const links = await db
    .select()
    .from(fileLinks)
    .where(
      and(
        eq(fileLinks.fileId, fileId),
        isNull(fileLinks.deletedAt)
      )
    );
  
  return links;
}

/**
 * Link file to entity
 */
export async function linkFileToEntity(
  fileId: string,
  entityType: string,
  entityId: string,
  linkedBy: string,
  note?: string
) {
  // Check if already linked
  const existing = await db
    .select()
    .from(fileLinks)
    .where(
      and(
        eq(fileLinks.fileId, fileId),
        eq(fileLinks.entityType, entityType),
        eq(fileLinks.entityId, entityId),
        isNull(fileLinks.deletedAt)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  // Create link
  const [link] = await db
    .insert(fileLinks)
    .values({
      fileId,
      entityType,
      entityId,
      linkedBy,
      note,
    })
    .returning();
  
  // Update linked count on file
  await db
    .update(files)
    .set({
      linkedCount: sql`${files.linkedCount} + 1`,
    })
    .where(eq(files.id, fileId));
  
  // Update attachment count on entity
  await updateEntityAttachmentCount(entityType, entityId);
  
  return link;
}

/**
 * Unlink file from entity
 */
export async function unlinkFileFromEntity(
  fileId: string,
  entityType: string,
  entityId: string
) {
  // Soft delete the link
  await db
    .update(fileLinks)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(fileLinks.fileId, fileId),
        eq(fileLinks.entityType, entityType),
        eq(fileLinks.entityId, entityId)
      )
    );
  
  // Update linked count on file
  await db
    .update(files)
    .set({
      linkedCount: sql`GREATEST(0, ${files.linkedCount} - 1)`,
    })
    .where(eq(files.id, fileId));
  
  // Update attachment count on entity
  await updateEntityAttachmentCount(entityType, entityId);
}

/**
 * Get files linked to entity
 */
export async function getEntityFiles(entityType: string, entityId: string) {
  const results = await db
    .select({
      file: files,
      link: fileLinks,
    })
    .from(fileLinks)
    .innerJoin(files, eq(fileLinks.fileId, files.id))
    .where(
      and(
        eq(fileLinks.entityType, entityType),
        eq(fileLinks.entityId, entityId),
        isNull(fileLinks.deletedAt),
        isNull(files.deletedAt)
      )
    )
    .orderBy(desc(fileLinks.linkedAt));
  
  return results.map((r) => ({
    ...r.file,
    linkNote: r.link.note,
    linkedAt: r.link.linkedAt,
    linkedBy: r.link.linkedBy,
  }));
}

/**
 * Update entity attachment count
 */
async function updateEntityAttachmentCount(entityType: string, entityId: string) {
  const count = await db
    .select()
    .from(fileLinks)
    .where(
      and(
        eq(fileLinks.entityType, entityType),
        eq(fileLinks.entityId, entityId),
        isNull(fileLinks.deletedAt)
      )
    )
    .then((rows) => rows.length);
  
  switch (entityType) {
    case "TASK":
      await db.update(tasks).set({ attachmentCount: count }).where(eq(tasks.id, entityId));
      break;
    case "UPDATE":
      await db.update(updates).set({ attachmentCount: count }).where(eq(updates.id, entityId));
      break;
    case "SPENDING":
      await db.update(spending).set({ attachmentCount: count }).where(eq(spending.id, entityId));
      break;
    case "REQUEST":
      await db.update(requests).set({ attachmentCount: count }).where(eq(requests.id, entityId));
      break;
  }
}

/**
 * Increment view count
 */
export async function trackFileView(fileId: string) {
  await db
    .update(files)
    .set({
      viewCount: sql`${files.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(files.id, fileId));
}

/**
 * Update file metadata
 */
export async function updateFileMetadata(
  fileId: string,
  updates: {
    category?: string;
    tags?: string[];
    description?: string;
  }
) {
  const data: any = {};
  
  if (updates.category) {
    data.category = updates.category;
  }
  if (updates.tags) {
    data.tags = JSON.stringify(updates.tags);
  }
  if (updates.description !== undefined) {
    data.description = updates.description;
  }
  
  data.updatedAt = new Date();
  
  await db
    .update(files)
    .set(data)
    .where(eq(files.id, fileId));
}
```

---

## 📋 PART 3: BACKEND - ENHANCED UPLOAD ENDPOINTS (1.5 hours)

**Update: `server/routes/uploads.ts`**

```typescript
import { Router } from "express";
import multer from "multer";
import { db } from "../db";
import { files, fileLinks } from "@shared/schema";
import {
  uploadFile,
  deleteFile,
  listFiles,
  getFileUsage,
  linkFileToEntity,
  unlinkFileFromEntity,
  getEntityFiles,
  trackFileView,
  updateFileMetadata,
} from "../services/storage-provider";
import { eq, and, isNull } from "drizzle-orm";

const router = Router();

// Configure multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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

// =============================================================================
// FILE LIBRARY ENDPOINTS
// =============================================================================

/**
 * Upload file to library
 * POST /api/files/upload
 */
router.post("/upload", upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }
    
    const { category = "OTHER", tags, description, linkTo } = req.body;
    const householdId = req.householdId;
    const userId = req.user.claims.sub;
    
    // Upload file to storage
    const uploadResult = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      { generateThumbnail: req.file.mimetype.startsWith("image/") }
    );
    
    // Save to database
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
        category,
        tags: tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null,
        description,
      })
      .returning();
    
    // If linkTo is provided, link to entity immediately
    if (linkTo) {
      const { entityType, entityId, note } = JSON.parse(linkTo);
      await linkFileToEntity(file.id, entityType, entityId, userId, note);
    }
    
    res.json(file);
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Upload failed" });
  }
});

/**
 * List all files in library
 * GET /api/files
 */
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
      limit = 50,
      offset = 0,
    } = req.query;
    
    const result = await listFiles(householdId, {
      category,
      search,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
      uploadedBy,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    
    res.json(result);
  } catch (error: any) {
    console.error("Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * Get single file details
 * GET /api/files/:id
 */
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
    
    // Track view
    await trackFileView(id);
    
    // Get usage info
    const usage = await getFileUsage(id);
    
    res.json({
      ...file,
      usage,
    });
  } catch (error: any) {
    console.error("Error getting file:", error);
    res.status(500).json({ error: "Failed to get file" });
  }
});

/**
 * Update file metadata
 * PATCH /api/files/:id
 */
router.patch("/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId;
    const { category, tags, description } = req.body;
    
    // Verify file belongs to household
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, id),
          eq(files.householdId, householdId)
        )
      )
      .limit(1);
    
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    await updateFileMetadata(id, { category, tags, description });
    
    // Get updated file
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

/**
 * Delete file from library
 * DELETE /api/files/:id
 */
router.delete("/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId;
    
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, id),
          eq(files.householdId, householdId)
        )
      )
      .limit(1);
    
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    // Soft delete
    await db
      .update(files)
      .set({ deletedAt: new Date() })
      .where(eq(files.id, id));
    
    // Also soft delete all links
    await db
      .update(fileLinks)
      .set({ deletedAt: new Date() })
      .where(eq(fileLinks.fileId, id));
    
    // Optionally delete from storage
    // await deleteFile(file.storagePath, file.storageProvider);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// =============================================================================
// FILE LINKING ENDPOINTS
// =============================================================================

/**
 * Link existing file to entity
 * POST /api/files/:id/link
 */
router.post("/:id/link", async (req: any, res) => {
  try {
    const { id } = req.params;
    const { entityType, entityId, note } = req.body;
    const userId = req.user.claims.sub;
    const householdId = req.householdId;
    
    // Verify file exists and belongs to household
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

/**
 * Unlink file from entity
 * DELETE /api/files/:id/link/:entityType/:entityId
 */
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

/**
 * Get files for entity
 * GET /api/files/entity/:entityType/:entityId
 */
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

/**
 * Get all unique categories
 * GET /api/files/categories
 */
router.get("/meta/categories", async (req: any, res) => {
  try {
    const householdId = req.householdId;
    
    const categories = await db
      .selectDistinct({ category: files.category })
      .from(files)
      .where(
        and(
          eq(files.householdId, householdId),
          isNull(files.deletedAt)
        )
      );
    
    res.json(categories.map((c) => c.category));
  } catch (error: any) {
    console.error("Error getting categories:", error);
    res.status(500).json({ error: "Failed to get categories" });
  }
});

/**
 * Get all unique tags
 * GET /api/files/tags
 */
router.get("/meta/tags", async (req: any, res) => {
  try {
    const householdId = req.householdId;
    
    const filesWithTags = await db
      .select({ tags: files.tags })
      .from(files)
      .where(
        and(
          eq(files.householdId, householdId),
          isNull(files.deletedAt)
        )
      );
    
    const allTags = new Set<string>();
    filesWithTags.forEach((f) => {
      if (f.tags) {
        const tags = JSON.parse(f.tags);
        tags.forEach((tag: string) => allTags.add(tag));
      }
    });
    
    res.json(Array.from(allTags).sort());
  } catch (error: any) {
    console.error("Error getting tags:", error);
    res.status(500).json({ error: "Failed to get tags" });
  }
});

export default router;
```

**Update: `server/routes.ts`**

```typescript
import fileRoutes from "./routes/uploads";

// Register routes
app.use("/api/files", isAuthenticated, householdContext, fileRoutes);

// Serve local uploads
if (process.env.STORAGE_PROVIDER !== "S3") {
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
}
```

---

## 📋 PART 4: FRONTEND - FILE LIBRARY PAGE (2 hours)

**Create: `client/src/pages/file-library.tsx`**

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, Upload, Grid, List, Filter, FolderOpen, 
  FileImage, FileText, File, Download, Trash2, 
  Link as LinkIcon, Eye, Calendar, Tag 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PhotoCapture } from "@/components/photo-capture";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useToast } from "@/hooks/use-toast";

interface File {
  id: string;
  filename: string;
  publicUrl: string;
  thumbnailPath?: string;
  mimeType: string;
  fileSize: number;
  category: string;
  tags: string;
  description?: string;
  linkedCount: number;
  viewCount: number;
  uploadedAt: string;
  uploadedBy: string;
  width?: number;
  height?: number;
}

export default function FileLibrary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  // Fetch files
  const { data: filesData, isLoading } = useQuery<{ files: File[]; total: number }>({
    queryKey: ["/api/files", { category: selectedCategory, search: searchQuery }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "ALL") params.append("category", selectedCategory);
      if (searchQuery) params.append("search", searchQuery);
      return apiRequest("GET", `/api/files?${params.toString()}`);
    },
  });
  
  // Fetch categories
  const { data: categories } = useQuery<string[]>({
    queryKey: ["/api/files/meta/categories"],
  });
  
  const files = filesData?.files || [];
  
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/files/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      setSelectedFile(null);
      toast({ title: "File deleted" });
    },
  });
  
  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  // Get file icon
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5" />;
    if (mimeType === "application/pdf") return <FileText className="h-5 w-5" />;
    return <File className="h-5 w-5" />;
  };
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">File Library</h1>
          <p className="text-muted-foreground">
            {filesData?.total || 0} files • {viewMode === "grid" ? "Grid" : "List"} view
          </p>
        </div>
        <Button onClick={() => setShowUploadModal(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Files
        </Button>
      </div>
      
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            {/* Category filter */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="RECEIPT">Receipts</SelectItem>
                <SelectItem value="DOCUMENT">Documents</SelectItem>
                <SelectItem value="PHOTO">Photos</SelectItem>
                <SelectItem value="VIDEO">Videos</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            
            {/* View toggle */}
            <div className="flex gap-1">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Files grid/list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading files...</div>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No files yet</h3>
            <p className="text-muted-foreground mb-4">Upload your first file to get started</p>
            <Button onClick={() => setShowUploadModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {files.map((file) => (
            <Card
              key={file.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedFile(file)}
            >
              <CardContent className="p-0">
                {/* Thumbnail */}
                <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden">
                  {file.mimeType.startsWith("image/") ? (
                    <img
                      src={file.publicUrl}
                      alt={file.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2">
                      {getFileIcon(file.mimeType)}
                      <span className="text-xs text-muted-foreground">
                        {file.mimeType.split("/")[1]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  
                  {/* Category badge */}
                  <Badge className="absolute top-2 right-2 text-xs">
                    {file.category}
                  </Badge>
                </div>
                
                {/* Info */}
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatFileSize(file.fileSize)}</span>
                    <div className="flex items-center gap-2">
                      {file.linkedCount > 0 && (
                        <span className="flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" />
                          {file.linkedCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="p-4 hover:bg-muted/50 cursor-pointer flex items-center gap-4"
                  onClick={() => setSelectedFile(file)}
                >
                  {/* Icon/Thumbnail */}
                  <div className="flex-shrink-0">
                    {file.mimeType.startsWith("image/") ? (
                      <img
                        src={file.publicUrl}
                        alt={file.filename}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                        {getFileIcon(file.mimeType)}
                      </div>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.filename}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatFileSize(file.fileSize)}</span>
                      <span>{formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}</span>
                      <Badge variant="outline">{file.category}</Badge>
                    </div>
                  </div>
                  
                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {file.linkedCount > 0 && (
                      <span className="flex items-center gap-1">
                        <LinkIcon className="h-4 w-4" />
                        {file.linkedCount}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      {file.viewCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* File detail modal */}
      <FileDetailModal
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
      
      {/* Upload modal */}
      <UploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
      />
    </div>
  );
}

// File detail modal
function FileDetailModal({
  file,
  onClose,
  onDelete,
}: {
  file: File | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { data: fileDetails } = useQuery({
    queryKey: ["/api/files", file?.id],
    queryFn: () => apiRequest("GET", `/api/files/${file?.id}`),
    enabled: !!file,
  });
  
  if (!file) return null;
  
  const usage = fileDetails?.usage || [];
  
  return (
    <Dialog open={!!file} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{file.filename}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Preview */}
          {file.mimeType.startsWith("image/") && (
            <img
              src={file.publicUrl}
              alt={file.filename}
              className="w-full rounded-lg"
            />
          )}
          
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="font-medium">{file.category}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Size</p>
              <p className="font-medium">{formatFileSize(file.fileSize)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Uploaded</p>
              <p className="font-medium">
                {formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Views</p>
              <p className="font-medium">{file.viewCount}</p>
            </div>
          </div>
          
          {/* Usage */}
          {usage.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Used in {usage.length} places:</h3>
              <div className="space-y-2">
                {usage.map((link: any) => (
                  <div key={link.id} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant="outline">{link.entityType}</Badge>
                        <p className="text-sm mt-1">{link.note || "No description"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" asChild>
              <a href={file.publicUrl} download>
                <Download className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("Delete this file?")) {
                  onDelete(file.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Upload modal
function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { preview, file, handleCapture, handleRemove, isUploading } = useFileUpload();
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file");
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      if (description) formData.append("description", description);
      
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({ title: "File uploaded successfully" });
      onClose();
    },
  });
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload to Library</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <PhotoCapture
            onCapture={handleCapture}
            onRemove={handleRemove}
            preview={preview}
            disabled={isUploading}
          />
          
          <div>
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RECEIPT">Receipt</SelectItem>
                <SelectItem value="DOCUMENT">Document</SelectItem>
                <SelectItem value="PHOTO">Photo</SelectItem>
                <SelectItem value="VIDEO">Video</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this file for?"
            />
          </div>
          
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || uploadMutation.isPending}
            className="w-full"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload to Library"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

---

## 📋 PART 5: ADD TO NAVIGATION (15 minutes)

**Update bottom navigation for both client and assistant:**

**Update: `client/src/components/layout/bottom-nav.tsx`**

```typescript
import { FolderOpen } from "lucide-react";

// For CLIENT
const clientTabs = [
  { path: "/", icon: Calendar, label: "This Week" },
  { path: "/approvals", icon: CheckCircle, label: "Approvals" },
  { path: "/requests", icon: MessageSquare, label: "Requests" },
  { path: "/updates", icon: Bell, label: "Updates" },
  { path: "/files", icon: FolderOpen, label: "Files" }, // NEW
  { path: "/messages", icon: MessageCircle, label: "Messages" },
];

// For ASSISTANT
const assistantTabs = [
  { path: "/", icon: Clock, label: "Today" },
  { path: "/tasks", icon: CheckSquare, label: "Tasks" },
  { path: "/calendar", icon: Calendar, label: "Calendar" },
  { path: "/files", icon: FolderOpen, label: "Files" }, // NEW
  { path: "/messages", icon: MessageCircle, label: "Messages" },
  { path: "/house", icon: Home, label: "House" },
];
```

**Add route to App.tsx:**

```typescript
import FileLibrary from "@/pages/file-library";

// In both ClientRouter and AssistantRouter
<Route path="/files" component={FileLibrary} />
```

---

## 📋 PART 6: LINK FILES TO ENTITIES (1 hour)

### Add File Picker Component

**Create: `client/src/components/file-picker.tsx`**

```typescript
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Link as LinkIcon } from "lucide-react";

interface FilePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (fileId: string) => void;
  entityType: string;
  entityId: string;
}

export function FilePicker({ open, onClose, onSelect, entityType, entityId }: FilePickerProps) {
  const [search, setSearch] = useState("");
  
  const { data: filesData } = useQuery({
    queryKey: ["/api/files", { search }],
    queryFn: () => apiRequest("GET", `/api/files?search=${search}&limit=20`),
    enabled: open,
  });
  
  const linkMutation = useMutation({
    mutationFn: (fileId: string) =>
      apiRequest("POST", `/api/files/${fileId}/link`, {
        entityType,
        entityId,
      }),
    onSuccess: () => {
      onSelect(selectedFileId!);
      onClose();
    },
  });
  
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link File from Library</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Files grid */}
          <div className="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {filesData?.files?.map((file: any) => (
              <div
                key={file.id}
                className={`border rounded-lg p-2 cursor-pointer hover:border-primary ${
                  selectedFileId === file.id ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setSelectedFileId(file.id)}
              >
                {file.mimeType.startsWith("image/") ? (
                  <img
                    src={file.publicUrl}
                    alt={file.filename}
                    className="w-full h-24 object-cover rounded"
                  />
                ) : (
                  <div className="w-full h-24 bg-muted rounded flex items-center justify-center">
                    <span className="text-xs">{file.filename}</span>
                  </div>
                )}
                <p className="text-xs mt-1 truncate">{file.filename}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  {file.category}
                </Badge>
              </div>
            ))}
          </div>
          
          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!selectedFileId || linkMutation.isPending}
              onClick={() => selectedFileId && linkMutation.mutate(selectedFileId)}
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Link File
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Update Task Modal with File Picker

**Update: `client/src/pages/tasks.tsx`**

```typescript
import { FilePicker } from "@/components/file-picker";
import { useQuery } from "@tanstack/react-query";

function TaskDetailModal({ task }: { task: Task }) {
  const [showFilePicker, setShowFilePicker] = useState(false);
  const { preview, handleCapture, handleRemove, upload, file } = useFileUpload();
  
  // Get linked files
  const { data: linkedFiles } = useQuery({
    queryKey: ["/api/files/entity/TASK", task.id],
  });
  
  return (
    <Dialog>
      <DialogContent>
        {/* Existing task details */}
        
        {/* Files section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Files & Attachments</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilePicker(true)}
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Link from Library
            </Button>
          </div>
          
          {/* Show linked files */}
          {linkedFiles && linkedFiles.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {linkedFiles.map((file: any) => (
                <img
                  key={file.id}
                  src={file.publicUrl}
                  alt={file.filename}
                  className="w-full h-20 object-cover rounded"
                />
              ))}
            </div>
          )}
          
          {/* Upload new */}
          <PhotoCapture
            onCapture={handleCapture}
            onRemove={handleRemove}
            preview={preview}
          />
          
          {preview && (
            <Button
              onClick={async () => {
                await upload({
                  entityType: "TASK",
                  entityId: task.id,
                });
              }}
              className="w-full"
            >
              Upload
            </Button>
          )}
        </div>
        
        <FilePicker
          open={showFilePicker}
          onClose={() => setShowFilePicker(false)}
          onSelect={() => {
            // Refresh linked files
            queryClient.invalidateQueries({
              queryKey: ["/api/files/entity/TASK", task.id],
            });
          }}
          entityType="TASK"
          entityId={task.id}
        />
      </DialogContent>
    </Dialog>
  );
}
```

---

## 🎯 FINAL IMPLEMENTATION SUMMARY

### What You Get:

✅ **Dual System Architecture:**
- Files uploaded to central library FIRST
- Then linked to specific entities
- Upload once, use many times
- Delete entity, keep file

✅ **File Library Page:**
- Browse all files (grid or list view)
- Search by filename/description
- Filter by category
- View file details and usage
- Track views and downloads
- Accessible to BOTH clients and assistants

✅ **Smart Linking:**
- Attach files from library to tasks/requests
- Upload new file and attach in one step
- See where files are used
- Unlink without deleting

✅ **Categories & Organization:**
- Receipt, Document, Photo, Video, Other
- Custom tags for better search
- Descriptions for context
- Usage statistics

### User Workflows:

**Workflow 1: Upload receipt to spending**
1. Create spending entry
2. Take photo → uploads to library
3. Auto-links to spending entry
4. Also browsable in file library

**Workflow 2: Link existing file**
1. Open task
2. Click "Link from Library"
3. Browse/search files
4. Select and link
5. File appears on task

**Workflow 3: Browse all receipts**
1. Navigate to File Library
2. Filter by "Receipts"
3. Search "June 2024"
4. See all receipts from June
5. Click to see where each is used

---

## 📊 DATABASE SIZE ESTIMATES

### Storage per household per year:

**Light use:**
- 50 files/month × 2MB average = 1.2GB/year
- Cost: $0.018/year (Cloudflare R2)

**Heavy use:**
- 200 files/month × 2MB average = 4.8GB/year
- Cost: $0.072/year (Cloudflare R2)

**Extreme use:**
- 500 files/month × 2MB average = 12GB/year
- Cost: $0.18/year (Cloudflare R2)

**Conclusion:** Storage costs are negligible. Go with R2.

---

## ✅ COMPLETE IMPLEMENTATION CHECKLIST

### Database (30 min)
- [ ] Add `files` table
- [ ] Add `fileLinks` table
- [ ] Update existing tables with attachment counts
- [ ] Run migration: `npm run db:push`

### Backend (2.5 hours)
- [ ] Update storage service with library functions
- [ ] Create enhanced upload routes
- [ ] Add file linking endpoints
- [ ] Add metadata endpoints (categories, tags)
- [ ] Test all endpoints with Postman

### Frontend (3 hours)
- [ ] Create File Library page
- [ ] Add to navigation (client + assistant)
- [ ] Create FilePicker component
- [ ] Update PhotoCapture component
- [ ] Update task modal with file linking
- [ ] Update updates with file attachments
- [ ] Update spending with receipts

### Testing (1 hour)
- [ ] Upload file to library
- [ ] Search and filter files
- [ ] Link file to task
- [ ] Upload file directly to task
- [ ] View file usage
- [ ] Delete file
- [ ] Test on mobile

---

## 🚀 DEPLOYMENT

Same as before - just add environment variables if using S3:

```bash
STORAGE_PROVIDER=S3  # or LOCAL for development
S3_BUCKET=hndld-files
S3_REGION=us-east-1
# ... etc
```

---

**Total Implementation Time: 6-8 hours**

This gives you a **complete, professional file management system** that:
- Centralizes all files in one library
- Links files to multiple entities
- Works for both clients and assistants
- Scales infinitely with cloud storage
- Costs almost nothing

**This is the feature that makes your app feel premium.** 🎉
