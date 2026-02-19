import { Router, Request, Response } from "express";
import { db } from "../db";
import { smartLocks, lockAccessCodes, lockAccessLog, vendors, guestAccess, people } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { getProvider } from "../services/smart-locks";
import logger from "../lib/logger";
import crypto from "crypto";

const router = Router();

router.get("/smart-locks", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    if (!householdId) return res.status(400).json({ message: "No household context" });

    const locks = await db
      .select()
      .from(smartLocks)
      .where(eq(smartLocks.householdId, householdId))
      .orderBy(smartLocks.name);

    res.json(locks);
  } catch (error) {
    logger.error("[SmartLocks] List error", { error });
    res.status(500).json({ message: "Failed to list locks" });
  }
});

router.get("/smart-locks/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const [lock] = await db
      .select()
      .from(smartLocks)
      .where(and(eq(smartLocks.id, req.params.id), eq(smartLocks.householdId, householdId)));

    if (!lock) return res.status(404).json({ message: "Lock not found" });

    const provider = getProvider(lock.provider);
    let status: { locked: boolean; battery?: number } = { locked: true };
    if (lock.isConnected && lock.externalId && lock.accessToken) {
      try {
        status = await provider.getStatus(lock.externalId, lock.accessToken);
      } catch { /* use defaults */ }
    }

    res.json({ ...lock, status });
  } catch (error) {
    logger.error("[SmartLocks] Get error", { error });
    res.status(500).json({ message: "Failed to get lock" });
  }
});

router.post("/smart-locks", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const { provider, name, externalId } = req.body;

    if (!provider || !name) {
      return res.status(400).json({ message: "Provider and name are required" });
    }

    const [lock] = await db.insert(smartLocks).values({
      householdId,
      provider,
      name,
      externalId: externalId || null,
      isConnected: !!externalId,
    }).returning();

    await db.insert(lockAccessLog).values({
      lockId: lock.id,
      householdId,
      action: "ADDED",
      method: "APP",
      timestamp: new Date(),
      metadata: { provider, name },
    });

    res.status(201).json(lock);
  } catch (error) {
    logger.error("[SmartLocks] Create error", { error });
    res.status(500).json({ message: "Failed to add lock" });
  }
});

router.patch("/smart-locks/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const { name, externalId } = req.body;

    const [lock] = await db
      .update(smartLocks)
      .set({
        ...(name && { name }),
        ...(externalId !== undefined && { externalId }),
        updatedAt: new Date(),
      })
      .where(and(eq(smartLocks.id, req.params.id), eq(smartLocks.householdId, householdId)))
      .returning();

    if (!lock) return res.status(404).json({ message: "Lock not found" });
    res.json(lock);
  } catch (error) {
    logger.error("[SmartLocks] Update error", { error });
    res.status(500).json({ message: "Failed to update lock" });
  }
});

router.delete("/smart-locks/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;

    await db.delete(lockAccessCodes).where(
      and(eq(lockAccessCodes.lockId, req.params.id), eq(lockAccessCodes.householdId, householdId))
    );
    await db.delete(lockAccessLog).where(
      and(eq(lockAccessLog.lockId, req.params.id), eq(lockAccessLog.householdId, householdId))
    );

    const [deleted] = await db
      .delete(smartLocks)
      .where(and(eq(smartLocks.id, req.params.id), eq(smartLocks.householdId, householdId)))
      .returning();

    if (!deleted) return res.status(404).json({ message: "Lock not found" });
    res.json({ message: "Lock removed" });
  } catch (error) {
    logger.error("[SmartLocks] Delete error", { error });
    res.status(500).json({ message: "Failed to remove lock" });
  }
});

router.post("/smart-locks/:id/lock", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const [lock] = await db
      .select()
      .from(smartLocks)
      .where(and(eq(smartLocks.id, req.params.id), eq(smartLocks.householdId, householdId)));

    if (!lock) return res.status(404).json({ message: "Lock not found" });

    const provider = getProvider(lock.provider);
    const success = await provider.lock({
      lockId: lock.id,
      externalId: lock.externalId || "",
      accessToken: lock.accessToken || "",
    });

    if (success) {
      await db.insert(lockAccessLog).values({
        lockId: lock.id,
        householdId,
        action: "LOCK",
        method: "APP",
        timestamp: new Date(),
        metadata: { user: (req as any).user?.username },
      });
    }

    res.json({ success, action: "LOCK" });
  } catch (error) {
    logger.error("[SmartLocks] Lock error", { error });
    res.status(500).json({ message: "Failed to lock" });
  }
});

router.post("/smart-locks/:id/unlock", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const [lock] = await db
      .select()
      .from(smartLocks)
      .where(and(eq(smartLocks.id, req.params.id), eq(smartLocks.householdId, householdId)));

    if (!lock) return res.status(404).json({ message: "Lock not found" });

    const provider = getProvider(lock.provider);
    const success = await provider.unlock({
      lockId: lock.id,
      externalId: lock.externalId || "",
      accessToken: lock.accessToken || "",
    });

    if (success) {
      await db.insert(lockAccessLog).values({
        lockId: lock.id,
        householdId,
        action: "UNLOCK",
        method: "APP",
        timestamp: new Date(),
        metadata: { user: (req as any).user?.username },
      });
    }

    res.json({ success, action: "UNLOCK" });
  } catch (error) {
    logger.error("[SmartLocks] Unlock error", { error });
    res.status(500).json({ message: "Failed to unlock" });
  }
});

router.get("/smart-locks/:id/codes", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const codes = await db
      .select({
        code: lockAccessCodes,
        vendorName: vendors.name,
        personName: people.fullName,
      })
      .from(lockAccessCodes)
      .leftJoin(vendors, eq(lockAccessCodes.vendorId, vendors.id))
      .leftJoin(people, eq(lockAccessCodes.personId, people.id))
      .where(and(
        eq(lockAccessCodes.lockId, req.params.id),
        eq(lockAccessCodes.householdId, householdId)
      ))
      .orderBy(desc(lockAccessCodes.createdAt));

    res.json(codes.map(c => ({
      ...c.code,
      vendorName: c.vendorName,
      personName: c.personName,
    })));
  } catch (error) {
    logger.error("[SmartLocks] List codes error", { error });
    res.status(500).json({ message: "Failed to list codes" });
  }
});

router.post("/smart-locks/:id/codes", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const { name, code, vendorId, guestAccessId, personId, startsAt, expiresAt, scheduleType, scheduleDays, scheduleStartTime, scheduleEndTime } = req.body;

    if (!name) return res.status(400).json({ message: "Name is required" });

    const [lock] = await db
      .select()
      .from(smartLocks)
      .where(and(eq(smartLocks.id, req.params.id), eq(smartLocks.householdId, householdId)));

    if (!lock) return res.status(404).json({ message: "Lock not found" });

    let externalCodeId: string | null = null;
    if (lock.isConnected && lock.externalId && lock.accessToken && code) {
      const provider = getProvider(lock.provider);
      externalCodeId = await provider.createCode({
        lockId: lock.id,
        externalId: lock.externalId,
        accessToken: lock.accessToken,
        code,
        name,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
    }

    const [accessCode] = await db.insert(lockAccessCodes).values({
      lockId: lock.id,
      householdId,
      name,
      code: code || null,
      externalCodeId,
      vendorId: vendorId || null,
      guestAccessId: guestAccessId || null,
      personId: personId || null,
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      scheduleType: scheduleType || "ALWAYS",
      scheduleDays: scheduleDays || null,
      scheduleStartTime: scheduleStartTime || null,
      scheduleEndTime: scheduleEndTime || null,
    }).returning();

    await db.insert(lockAccessLog).values({
      lockId: lock.id,
      householdId,
      action: "CODE_CREATED",
      codeId: accessCode.id,
      method: "APP",
      timestamp: new Date(),
      metadata: { name, scheduleType: scheduleType || "ALWAYS" },
    });

    res.status(201).json(accessCode);
  } catch (error) {
    logger.error("[SmartLocks] Create code error", { error });
    res.status(500).json({ message: "Failed to create access code" });
  }
});

router.patch("/smart-locks/:lockId/codes/:codeId", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const { isActive, name, expiresAt, scheduleType, scheduleDays, scheduleStartTime, scheduleEndTime } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (isActive !== undefined) updates.isActive = isActive;
    if (name) updates.name = name;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (scheduleType) updates.scheduleType = scheduleType;
    if (scheduleDays !== undefined) updates.scheduleDays = scheduleDays;
    if (scheduleStartTime !== undefined) updates.scheduleStartTime = scheduleStartTime;
    if (scheduleEndTime !== undefined) updates.scheduleEndTime = scheduleEndTime;

    const [code] = await db
      .update(lockAccessCodes)
      .set(updates)
      .where(and(
        eq(lockAccessCodes.id, req.params.codeId),
        eq(lockAccessCodes.lockId, req.params.lockId),
        eq(lockAccessCodes.householdId, householdId)
      ))
      .returning();

    if (!code) return res.status(404).json({ message: "Code not found" });

    await db.insert(lockAccessLog).values({
      lockId: req.params.lockId,
      householdId,
      action: isActive === false ? "CODE_DISABLED" : "CODE_UPDATED",
      codeId: code.id,
      method: "APP",
      timestamp: new Date(),
    });

    res.json(code);
  } catch (error) {
    logger.error("[SmartLocks] Update code error", { error });
    res.status(500).json({ message: "Failed to update code" });
  }
});

router.delete("/smart-locks/:lockId/codes/:codeId", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;

    const [code] = await db
      .select()
      .from(lockAccessCodes)
      .where(and(
        eq(lockAccessCodes.id, req.params.codeId),
        eq(lockAccessCodes.lockId, req.params.lockId),
        eq(lockAccessCodes.householdId, householdId)
      ));

    if (!code) return res.status(404).json({ message: "Code not found" });

    if (code.externalCodeId) {
      const [lock] = await db.select().from(smartLocks).where(eq(smartLocks.id, req.params.lockId));
      if (lock?.externalId && lock.accessToken) {
        const provider = getProvider(lock.provider);
        await provider.deleteCode(lock.externalId, code.externalCodeId, lock.accessToken);
      }
    }

    await db.delete(lockAccessCodes).where(eq(lockAccessCodes.id, req.params.codeId));

    await db.insert(lockAccessLog).values({
      lockId: req.params.lockId,
      householdId,
      action: "CODE_DELETED",
      method: "APP",
      timestamp: new Date(),
      metadata: { name: code.name },
    });

    res.json({ message: "Code deleted" });
  } catch (error) {
    logger.error("[SmartLocks] Delete code error", { error });
    res.status(500).json({ message: "Failed to delete code" });
  }
});

router.get("/smart-locks/:id/activity", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const activity = await db
      .select({
        log: lockAccessLog,
        codeName: lockAccessCodes.name,
      })
      .from(lockAccessLog)
      .leftJoin(lockAccessCodes, eq(lockAccessLog.codeId, lockAccessCodes.id))
      .where(and(
        eq(lockAccessLog.lockId, req.params.id),
        eq(lockAccessLog.householdId, householdId)
      ))
      .orderBy(desc(lockAccessLog.timestamp))
      .limit(limit);

    res.json(activity.map(a => ({
      ...a.log,
      codeName: a.codeName,
    })));
  } catch (error) {
    logger.error("[SmartLocks] Activity error", { error });
    res.status(500).json({ message: "Failed to get activity" });
  }
});

export function registerSmartLockRoutes(router_parent: any) {
  router_parent.use(router);
}
