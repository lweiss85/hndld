import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { extractReceiptData } from "../services/receipt-ocr";
import { db } from "../db";
import { spendingItems, files as filesTable } from "@shared/schema";
import { getStorageProvider } from "../services/storage-provider";
import { wsManager } from "../services/websocket";
import logger from "../lib/logger";
import { badRequest, internalError } from "../lib/errors";
import crypto from "crypto";

const router = Router();
const householdContext = householdContextMiddleware;

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are accepted for receipt scanning"));
    }
  },
});

router.post(
  "/receipts/scan",
  isAuthenticated,
  householdContext,
  receiptUpload.single("receipt"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw badRequest("No receipt image uploaded");
      }

      const mimeType = req.file.mimetype;
      const result = await extractReceiptData(req.file.buffer, mimeType);

      res.json({
        extracted: result,
        imageSize: req.file.size,
        imageName: req.file.originalname,
      });
    } catch (error) {
      logger.error("[Receipts] Scan failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error instanceof Error && error.message.includes("Only image")
        ? badRequest(error.message)
        : internalError("Failed to scan receipt"));
    }
  }
);

router.post(
  "/receipts/confirm",
  isAuthenticated,
  householdContext,
  receiptUpload.single("receipt"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;

      const { vendor, category, amount, date, note } = req.body;

      if (!amount || isNaN(Number(amount))) {
        throw badRequest("Amount is required");
      }

      let receiptFileId: string | null = null;

      if (req.file) {
        const ext = req.file.originalname?.split(".").pop() || "jpg";
        const storagePath = `households/${householdId}/receipts/${crypto.randomUUID()}.${ext}`;

        await getStorageProvider().upload(storagePath, req.file.buffer, req.file.mimetype);

        const storedName = storagePath.split("/").pop() || `receipt.${ext}`;
        const [fileRecord] = await db
          .insert(filesTable)
          .values({
            householdId,
            filename: req.file.originalname || `receipt.${ext}`,
            storedFilename: storedName,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            storagePath,
            storageProvider: "LOCAL",
            uploadedBy: userId,
            category: "OTHER",
          })
          .returning();

        receiptFileId = fileRecord.id;
      }

      const [item] = await db
        .insert(spendingItems)
        .values({
          householdId,
          createdBy: userId,
          amount: Math.round(Number(amount)),
          vendor: vendor || null,
          category: category || null,
          note: note || "Scanned receipt",
          date: date ? new Date(date) : new Date(),
          receipts: receiptFileId ? [receiptFileId] : [],
          status: "DRAFT",
          kind: "REIMBURSEMENT",
        })
        .returning();

      wsManager.broadcast("spending:created", { id: item.id }, householdId, userId);

      res.status(201).json(item);
    } catch (error) {
      logger.error("[Receipts] Confirm failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error && error.message === "Amount is required") {
        next(badRequest("Amount is required"));
      } else {
        next(internalError("Failed to create spending item from receipt"));
      }
    }
  }
);

export function registerReceiptRoutes(app: Router) {
  app.use(router);
}
