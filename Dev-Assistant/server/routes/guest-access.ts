import { Router, Request, Response } from "express";
import { db } from "../db";
import { guestAccess, notifications, userProfiles, households } from "@shared/schema";
import { eq, and, lte, desc, sql, or } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";
import crypto from "crypto";

const router = Router();

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const ACCESS_LEVEL_PRESETS: Record<string, any> = {
  VIEW_ONLY: {
    canViewTasks: true,
    canViewCalendar: true,
    canViewVendors: false,
    canViewFiles: false,
    canSendMessages: false,
    canCreateTasks: false,
  },
  LIMITED: {
    canViewTasks: true,
    canViewCalendar: true,
    canViewVendors: true,
    canViewFiles: false,
    canSendMessages: true,
    canCreateTasks: false,
  },
  STANDARD: {
    canViewTasks: true,
    canViewCalendar: true,
    canViewVendors: true,
    canViewFiles: true,
    canSendMessages: true,
    canCreateTasks: true,
  },
  FULL: {
    canViewTasks: true,
    canViewCalendar: true,
    canViewVendors: true,
    canViewFiles: true,
    canSendMessages: true,
    canCreateTasks: true,
  },
};

router.get(
  "/guest-access",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const rows = await db.select().from(guestAccess)
        .where(eq(guestAccess.householdId, householdId))
        .orderBy(desc(guestAccess.createdAt));
      res.json(rows);
    } catch (err) {
      logger.error("[GuestAccess] List failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to fetch guest access" });
    }
  }
);

router.post(
  "/guest-access/invite",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).userId;
      const { guestEmail, guestName, accessLevel, permissions, startsAt, expiresAt, purpose } = req.body;

      if (!guestEmail || !accessLevel || !startsAt || !expiresAt) {
        return res.status(400).json({ error: "guestEmail, accessLevel, startsAt, and expiresAt are required" });
      }

      const start = new Date(startsAt);
      const end = new Date(expiresAt);
      if (end <= start) {
        return res.status(400).json({ error: "expiresAt must be after startsAt" });
      }

      const finalPermissions = permissions || ACCESS_LEVEL_PRESETS[accessLevel] || ACCESS_LEVEL_PRESETS.VIEW_ONLY;
      const token = generateToken();

      const [row] = await db.insert(guestAccess).values({
        householdId,
        invitedBy: userId,
        guestEmail,
        guestName: guestName || null,
        accessLevel,
        permissions: finalPermissions,
        startsAt: start,
        expiresAt: end,
        purpose: purpose || null,
        inviteToken: token,
        status: "PENDING",
      }).returning();

      res.status(201).json(row);
    } catch (err) {
      logger.error("[GuestAccess] Invite failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to create invitation" });
    }
  }
);

router.post(
  "/guest-access/accept/:token",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const userId = (req as any).userId;
      const userEmail = (req as any).user?.email;

      const [invite] = await db.select().from(guestAccess)
        .where(eq(guestAccess.inviteToken, token));

      if (!invite) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (invite.guestEmail.toLowerCase() !== userEmail?.toLowerCase()) {
        return res.status(403).json({ error: "This invitation was sent to a different email address" });
      }

      if (invite.status === "REVOKED") {
        return res.status(400).json({ error: "This invitation has been revoked" });
      }

      const now = new Date();
      if (invite.status === "EXPIRED" || now > invite.expiresAt) {
        return res.status(400).json({ error: "This invitation has expired" });
      }

      if (now < invite.startsAt) {
        return res.status(400).json({ error: "This invitation is not active yet" });
      }

      if (invite.status === "ACTIVE") {
        return res.json({ message: "Already accepted", invite });
      }

      const [updated] = await db.update(guestAccess)
        .set({
          status: "ACTIVE",
          acceptedAt: now,
          guestUserId: userId,
          inviteToken: null,
          updatedAt: now,
        })
        .where(eq(guestAccess.id, invite.id))
        .returning();

      const members = await db.select().from(userProfiles)
        .where(eq(userProfiles.householdId, invite.householdId));

      for (const member of members) {
        await db.insert(notifications).values({
          householdId: invite.householdId,
          userId: member.userId,
          type: "DAILY_DIGEST",
          title: `${invite.guestName || invite.guestEmail} accepted guest access`,
          body: `Guest access is now active${invite.purpose ? ` for: ${invite.purpose}` : ""}.`,
          linkUrl: "/guest-access",
        });
      }

      res.json(updated);
    } catch (err) {
      logger.error("[GuestAccess] Accept failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  }
);

router.post(
  "/guest-access/:id/revoke",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).userId;
      const { id } = req.params;
      const { reason } = req.body;

      const [existing] = await db.select().from(guestAccess)
        .where(and(eq(guestAccess.id, id), eq(guestAccess.householdId, householdId)));

      if (!existing) {
        return res.status(404).json({ error: "Guest access not found" });
      }

      if (existing.status === "REVOKED") {
        return res.status(400).json({ error: "Already revoked" });
      }

      const [updated] = await db.update(guestAccess)
        .set({
          status: "REVOKED",
          revokedAt: new Date(),
          revokedBy: userId,
          revokeReason: reason || null,
          updatedAt: new Date(),
        })
        .where(eq(guestAccess.id, id))
        .returning();

      res.json(updated);
    } catch (err) {
      logger.error("[GuestAccess] Revoke failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to revoke access" });
    }
  }
);

router.patch(
  "/guest-access/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const { id } = req.params;

      const [existing] = await db.select().from(guestAccess)
        .where(and(eq(guestAccess.id, id), eq(guestAccess.householdId, householdId)));

      if (!existing) return res.status(404).json({ error: "Guest access not found" });

      const updates: any = { updatedAt: new Date() };
      if (req.body.accessLevel) {
        updates.accessLevel = req.body.accessLevel;
        updates.permissions = req.body.permissions || ACCESS_LEVEL_PRESETS[req.body.accessLevel];
      }
      if (req.body.permissions) updates.permissions = req.body.permissions;
      if (req.body.expiresAt) updates.expiresAt = new Date(req.body.expiresAt);
      if (req.body.purpose !== undefined) updates.purpose = req.body.purpose || null;

      const [row] = await db.update(guestAccess).set(updates)
        .where(eq(guestAccess.id, id)).returning();

      res.json(row);
    } catch (err) {
      logger.error("[GuestAccess] Update failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to update guest access" });
    }
  }
);

router.delete(
  "/guest-access/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const { id } = req.params;

      const [existing] = await db.select().from(guestAccess)
        .where(and(eq(guestAccess.id, id), eq(guestAccess.householdId, householdId)));

      if (!existing) return res.status(404).json({ error: "Guest access not found" });

      await db.delete(guestAccess).where(eq(guestAccess.id, id));
      res.json({ success: true });
    } catch (err) {
      logger.error("[GuestAccess] Delete failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to delete guest access" });
    }
  }
);

export async function processGuestAccessExpiry(): Promise<void> {
  const now = new Date();

  const expired = await db.select().from(guestAccess)
    .where(and(
      or(eq(guestAccess.status, "PENDING"), eq(guestAccess.status, "ACTIVE")),
      lte(guestAccess.expiresAt, now),
    ));

  let count = 0;
  for (const guest of expired) {
    await db.update(guestAccess)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(eq(guestAccess.id, guest.id));

    const members = await db.select().from(userProfiles)
      .where(eq(userProfiles.householdId, guest.householdId));

    for (const member of members) {
      await db.insert(notifications).values({
        householdId: guest.householdId,
        userId: member.userId,
        type: "DAILY_DIGEST",
        title: `Guest access expired for ${guest.guestName || guest.guestEmail}`,
        body: `Temporary access${guest.purpose ? ` (${guest.purpose})` : ""} has ended.`,
        linkUrl: "/guest-access",
      });
    }
    count++;
  }

  if (count > 0) {
    logger.info("[GuestAccess] Expired guest access entries", { count });
  }
}

export function registerGuestAccessRoutes(app: Router) {
  app.use(router);
}
