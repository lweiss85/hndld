import { Router, Request, Response } from "express";
import * as otplib from "otplib";
import QRCode from "qrcode";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { db } from "../db";
import { twoFactorSecrets, twoFactorAttempts } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { encryptVaultValue, decryptVaultValue } from "../services/vault-encryption";
import { criticalLimiter } from "../lib/rate-limit";
import logger from "../lib/logger";

const router = Router();

router.post("/2fa/setup", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.claims.sub;

    const existing = await db.select().from(twoFactorSecrets)
      .where(eq(twoFactorSecrets.userId, userId)).limit(1);

    if (existing[0]?.isEnabled) {
      return res.status(400).json({ error: "2FA is already enabled" });
    }

    const secret = otplib.generateSecret();
    const encryptedSecret = encryptVaultValue(secret);

    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase()
    );
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 10))
    );

    await db.insert(twoFactorSecrets).values({
      userId,
      secret: encryptedSecret,
      isEnabled: false,
      backupCodes: hashedBackupCodes,
    }).onConflictDoUpdate({
      target: twoFactorSecrets.userId,
      set: { secret: encryptedSecret, backupCodes: hashedBackupCodes, updatedAt: new Date() }
    });

    const otpauth = otplib.generateURI({ secret, issuer: "hndld", label: userId });
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    res.json({
      qrCode: qrCodeUrl,
      secret,
      backupCodes,
    });
  } catch (error: unknown) {
    logger.error("2FA setup failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to setup 2FA" });
  }
});

router.post("/2fa/verify", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.claims.sub;
    const { code } = req.body;

    const [record] = await db.select().from(twoFactorSecrets)
      .where(eq(twoFactorSecrets.userId, userId)).limit(1);

    if (!record) {
      return res.status(400).json({ error: "2FA not setup. Please setup first." });
    }

    const secret = decryptVaultValue(record.secret);
    const result = otplib.verifySync({ token: code, secret });

    await db.insert(twoFactorAttempts).values({
      userId,
      success: result.valid,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.valid) {
      return res.status(400).json({ error: "Invalid code. Please try again." });
    }

    await db.update(twoFactorSecrets)
      .set({ isEnabled: true, updatedAt: new Date() })
      .where(eq(twoFactorSecrets.userId, userId));

    res.json({ success: true, message: "2FA enabled successfully" });
  } catch (error: unknown) {
    logger.error("2FA verification failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/2fa/disable", isAuthenticated, criticalLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.claims.sub;
    const { code } = req.body;

    const [record] = await db.select().from(twoFactorSecrets)
      .where(eq(twoFactorSecrets.userId, userId)).limit(1);

    if (!record?.isEnabled) {
      return res.status(400).json({ error: "2FA is not enabled" });
    }

    const secret = decryptVaultValue(record.secret);
    const result = otplib.verifySync({ token: code, secret });

    if (!result.valid) {
      return res.status(400).json({ error: "Invalid code" });
    }

    await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, userId));

    res.json({ success: true, message: "2FA disabled" });
  } catch (error: unknown) {
    logger.error("2FA disable failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

router.get("/2fa/status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.claims.sub;

    const [record] = await db.select({ isEnabled: twoFactorSecrets.isEnabled })
      .from(twoFactorSecrets)
      .where(eq(twoFactorSecrets.userId, userId)).limit(1);

    res.json({ enabled: record?.isEnabled ?? false });
  } catch (error: unknown) {
    logger.error("2FA status check failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to check 2FA status" });
  }
});

router.post("/2fa/validate", criticalLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, code } = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "User ID is required" });
    }
    if (!code || typeof code !== "string" || code.length < 6 || code.length > 10) {
      return res.status(400).json({ error: "Valid code is required (6-10 characters)" });
    }

    const [record] = await db.select().from(twoFactorSecrets)
      .where(eq(twoFactorSecrets.userId, userId)).limit(1);

    if (!record?.isEnabled) {
      return res.json({ valid: true, required: false });
    }

    const secret = decryptVaultValue(record.secret);
    const result = otplib.verifySync({ token: code, secret });
    let isValid = result.valid;

    if (!isValid && record.backupCodes) {
      for (let i = 0; i < record.backupCodes.length; i++) {
        const match = await bcrypt.compare(code, record.backupCodes[i]);
        if (match) {
          isValid = true;
          const updatedCodes = [...record.backupCodes];
          updatedCodes.splice(i, 1);
          await db.update(twoFactorSecrets)
            .set({ backupCodes: updatedCodes, updatedAt: new Date() })
            .where(eq(twoFactorSecrets.userId, userId));
          break;
        }
      }
    }

    await db.insert(twoFactorAttempts).values({
      userId,
      success: isValid,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ valid: isValid, required: true });
  } catch (error: unknown) {
    logger.error("2FA validation failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Validation failed" });
  }
});

export function registerTwoFactorRoutes(app: Router) {
  app.use(router);
}
