import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "../db";
import { files, fileLinks } from "@shared/schema";
import { eq, and, isNull, desc, gte, lte, sql, ilike, or } from "drizzle-orm";

export interface StorageProvider {
  upload(filePath: string, content: Buffer, mimeType?: string): Promise<string>;
  download(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  getUrl(key: string): string;
}

export interface UploadResult {
  storedFilename: string;
  storagePath: string;
  publicUrl: string;
  storageProvider: "LOCAL" | "S3" | "R2";
  width?: number;
  height?: number;
  thumbnailPath?: string;
}

class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string = "./uploads") {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async upload(filePath: string, content: Buffer, mimeType?: string): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    await fs.promises.writeFile(fullPath, content);
    return filePath;
  }

  async download(key: string): Promise<Buffer | null> {
    const fullPath = path.join(this.baseDir, key);
    try {
      return await fs.promises.readFile(fullPath);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const fullPath = path.join(this.baseDir, key);
    try {
      await fs.promises.unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

class S3CompatibleStorageProvider implements StorageProvider {
  private bucket: string;
  private endpoint: string;
  private localFallback: LocalStorageProvider;

  constructor() {
    this.bucket = process.env.OBJECT_STORAGE_BUCKET || "";
    this.endpoint = process.env.OBJECT_STORAGE_ENDPOINT || "";
    this.localFallback = new LocalStorageProvider();
    
    console.log("[Storage] S3 provider initialized - note: full AWS SDK integration required for production use");
    console.log("[Storage] Currently falling back to local storage. Configure AWS SDK for S3 operations.");
  }

  async upload(filePath: string, content: Buffer, mimeType?: string): Promise<string> {
    console.log(`[Storage] S3 upload requested for: ${filePath}`);
    console.log("[Storage] Falling back to local storage (AWS SDK not configured)");
    return this.localFallback.upload(filePath, content, mimeType);
  }

  async download(key: string): Promise<Buffer | null> {
    console.log(`[Storage] S3 download requested for: ${key}`);
    return this.localFallback.download(key);
  }

  async delete(key: string): Promise<boolean> {
    console.log(`[Storage] S3 delete requested for: ${key}`);
    return this.localFallback.delete(key);
  }

  getUrl(key: string): string {
    if (this.endpoint && this.bucket) {
      return `${this.endpoint}/${this.bucket}/${key}`;
    }
    return this.localFallback.getUrl(key);
  }
}

let storageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageProvider) return storageProvider;

  const hasS3Config = !!(
    process.env.OBJECT_STORAGE_BUCKET &&
    process.env.OBJECT_STORAGE_ACCESS_KEY &&
    process.env.OBJECT_STORAGE_SECRET_KEY
  );

  if (hasS3Config && process.env.FEATURE_OBJECT_STORAGE === "true") {
    console.log("[Storage] Using S3-compatible storage provider");
    storageProvider = new S3CompatibleStorageProvider();
  } else {
    console.log("[Storage] Using local storage provider");
    storageProvider = new LocalStorageProvider();
  }

  return storageProvider;
}

export function isS3StorageEnabled(): boolean {
  return !!(
    process.env.OBJECT_STORAGE_BUCKET &&
    process.env.OBJECT_STORAGE_ACCESS_KEY &&
    process.env.OBJECT_STORAGE_SECRET_KEY &&
    process.env.FEATURE_OBJECT_STORAGE === "true"
  );
}

export async function uploadFile(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<UploadResult> {
  const provider = getStorageProvider();
  const ext = path.extname(originalFilename);
  const storedFilename = `${crypto.randomUUID()}${ext}`;
  const storagePath = `files/${storedFilename}`;
  
  await provider.upload(storagePath, buffer, mimeType);
  const publicUrl = provider.getUrl(storagePath);
  
  return {
    storedFilename,
    storagePath,
    publicUrl,
    storageProvider: isS3StorageEnabled() ? "S3" : "LOCAL",
  };
}

export async function deleteFile(storagePath: string): Promise<boolean> {
  const provider = getStorageProvider();
  return provider.delete(storagePath);
}

export interface ListFilesFilters {
  category?: string;
  search?: string;
  tags?: string[];
  uploadedBy?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export async function listFiles(
  householdId: string,
  filters: ListFilesFilters = {}
): Promise<{ files: any[]; total: number }> {
  const conditions: any[] = [
    eq(files.householdId, householdId),
    isNull(files.deletedAt),
  ];
  
  if (filters.category && filters.category !== "ALL") {
    conditions.push(eq(files.category, filters.category as any));
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
  
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(files)
    .where(and(...conditions));
  const total = Number(totalResult[0]?.count || 0);
  
  let query = db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.uploadedAt));
  
  if (filters.limit) {
    query = query.limit(filters.limit) as any;
  }
  if (filters.offset) {
    query = query.offset(filters.offset) as any;
  }
  
  let results = await query;
  
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    results = results.filter(
      (f) =>
        f.filename.toLowerCase().includes(searchLower) ||
        f.description?.toLowerCase().includes(searchLower)
    );
  }
  
  if (filters.tags && filters.tags.length > 0) {
    results = results.filter((f) => {
      const fileTags = f.tags || [];
      return filters.tags!.some((tag) => fileTags.includes(tag));
    });
  }
  
  return { files: results, total };
}

export async function getFileUsage(fileId: string) {
  return db
    .select()
    .from(fileLinks)
    .where(and(eq(fileLinks.fileId, fileId), isNull(fileLinks.deletedAt)));
}

export async function linkFileToEntity(
  fileId: string,
  entityType: string,
  entityId: string,
  linkedBy: string,
  note?: string
) {
  const existing = await db
    .select()
    .from(fileLinks)
    .where(
      and(
        eq(fileLinks.fileId, fileId),
        eq(fileLinks.entityType, entityType as any),
        eq(fileLinks.entityId, entityId),
        isNull(fileLinks.deletedAt)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  const [link] = await db
    .insert(fileLinks)
    .values({
      fileId,
      entityType: entityType as any,
      entityId,
      linkedBy,
      note,
    })
    .returning();
  
  await db
    .update(files)
    .set({ linkedCount: sql`COALESCE(${files.linkedCount}, 0) + 1` })
    .where(eq(files.id, fileId));
  
  return link;
}

export async function unlinkFileFromEntity(
  fileId: string,
  entityType: string,
  entityId: string
) {
  await db
    .update(fileLinks)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(fileLinks.fileId, fileId),
        eq(fileLinks.entityType, entityType as any),
        eq(fileLinks.entityId, entityId)
      )
    );
  
  await db
    .update(files)
    .set({ linkedCount: sql`GREATEST(0, COALESCE(${files.linkedCount}, 0) - 1)` })
    .where(eq(files.id, fileId));
}

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
        eq(fileLinks.entityType, entityType as any),
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

export async function trackFileView(fileId: string) {
  await db
    .update(files)
    .set({
      viewCount: sql`COALESCE(${files.viewCount}, 0) + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(files.id, fileId));
}

export async function updateFileMetadata(
  fileId: string,
  updates: {
    category?: string;
    tags?: string[];
    description?: string;
  }
) {
  const data: any = { updatedAt: new Date() };
  
  if (updates.category) {
    data.category = updates.category;
  }
  if (updates.tags) {
    data.tags = updates.tags;
  }
  if (updates.description !== undefined) {
    data.description = updates.description;
  }
  
  await db.update(files).set(data).where(eq(files.id, fileId));
}
