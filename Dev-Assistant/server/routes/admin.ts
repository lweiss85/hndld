import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { authLimiter, criticalLimiter } from "../lib/rate-limit";
import { encryptVaultValue, decryptVaultValue } from "../services/vault-encryption";
import { createBackupZip, listBackups, deleteBackup, getBackupPath, getBackupSettings, saveBackupSettings, exportAllData } from "../services/backup";
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, getNotificationSettings, upsertNotificationSettings } from "../services/notifications";
import { getSmartSuggestions } from "../services/ai-suggestions";
import { getVapidPublicKey, isPushEnabled, savePushSubscription, removePushSubscription, getUserSubscriptions } from "../services/push-notifications";
import { generateMomentsTasks } from "./helpers";

const householdContext = householdContextMiddleware;

async function getUserProfile(userId: string) {
  return storage.getUserProfile(userId);
}

export function registerAdminRoutes(app: Express) {
  // ============================================
  // AUDIT LOG ROUTES
  // ============================================
  
  app.get("/api/audit-logs", isAuthenticated, householdContext, requirePermission("CAN_VIEW_AUDIT_LOG"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view audit logs" });
      }
      
      const { entityType, startDate, endDate, limit, offset } = req.query;
      
      const { getAuditLogs } = await import("../services/audit");
      const logs = await getAuditLogs(householdId, {
        entityType: entityType as any,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
      });
      
      res.json(logs);
    } catch (error) {
      logger.error("Error fetching audit logs", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // ============================================
  // VAULT SETTINGS ROUTES
  // ============================================
  
  app.get("/api/vault/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage vault settings" });
      }
      
      const settings = await storage.getVaultSettings(householdId);
      res.json(settings || { 
        householdId, 
        pinHash: null, 
        autoLockMinutes: 5, 
        requirePinForSensitive: true 
      });
    } catch (error) {
      logger.error("Error fetching vault settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch vault settings" });
    }
  });

  app.post("/api/vault/set-pin", authLimiter, isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can set vault PIN" });
      }
      
      const { pin } = req.body;
      if (!pin || pin.length < 4) {
        return res.status(400).json({ message: "PIN must be at least 4 characters" });
      }
      
      const bcrypt = await import("bcrypt");
      const pinHash = await bcrypt.hash(pin, 10);
      
      await storage.upsertVaultSettings(householdId, { pinHash });
      
      const { logAudit } = await import("../services/audit");
      await logAudit({
        householdId,
        userId,
        action: "VAULT_PIN_SET",
        entityType: "VAULT",
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error setting vault PIN", { error, userId, householdId });
      res.status(500).json({ message: "Failed to set vault PIN" });
    }
  });

  app.post("/api/vault/verify-pin", authLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ message: "PIN required" });
      }
      
      const settings = await storage.getVaultSettings(householdId);
      if (!settings?.pinHash) {
        return res.status(400).json({ message: "No PIN set" });
      }
      
      const bcrypt = await import("bcrypt");
      const valid = await bcrypt.compare(pin, settings.pinHash);
      
      const { logAudit } = await import("../services/audit");
      await logAudit({
        householdId,
        userId,
        action: valid ? "VAULT_UNLOCK_SUCCESS" : "VAULT_UNLOCK_FAILED",
        entityType: "VAULT",
      });
      
      if (!valid) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      
      const expiresAt = Date.now() + (settings.autoLockMinutes || 5) * 60 * 1000;
      (req.session as any).vaultUnlocked = true;
      (req.session as any).vaultExpiresAt = expiresAt;
      (req.session as any).vaultHouseholdId = householdId;
      
      res.json({ 
        success: true, 
        expiresIn: (settings.autoLockMinutes || 5) * 60 * 1000 
      });
    } catch (error) {
      logger.error("Error verifying vault PIN", { error, userId, householdId });
      res.status(500).json({ message: "Failed to verify PIN" });
    }
  });

  // ============================================
  // HANDOFF PACKET ROUTES
  // ============================================
  
  app.get("/api/handoff", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can generate handoff packets" });
      }
      
      const { generateHandoffPacket, generateHandoffHTML } = await import("../services/handoff");
      const data = await generateHandoffPacket(householdId);
      const html = generateHandoffHTML(data);
      
      const { logAudit } = await import("../services/audit");
      await logAudit({
        householdId,
        userId,
        action: "HANDOFF_GENERATED",
        entityType: "HOUSEHOLD",
        entityId: householdId,
      });
      
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition", `inline; filename="handoff-packet.html"`);
      res.send(html);
    } catch (error) {
      logger.error("Error generating handoff packet", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate handoff packet" });
    }
  });
  
  app.get("/api/handoff/data", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can access handoff data" });
      }
      
      const { generateHandoffPacket } = await import("../services/handoff");
      const data = await generateHandoffPacket(householdId);
      
      res.json(data);
    } catch (error) {
      logger.error("Error generating handoff data", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate handoff data" });
    }
  });

  app.get("/api/moments/generate", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can generate moment tasks" });
      }
      
      const tasksCreated = await generateMomentsTasks(householdId);
      
      res.json({
        tasksCreated,
        message: tasksCreated > 0 
          ? `Successfully created ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} for upcoming important dates`
          : "No new tasks to create for upcoming important dates"
      });
    } catch (error) {
      logger.error("Error generating moment tasks", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate moment tasks" });
    }
  });

  // ============================================
  // NOTIFICATIONS ROUTES
  // ============================================

  app.get("/api/notifications", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const notificationsList = await getNotifications(userId, householdId);
      res.json(notificationsList);
    } catch (error) {
      logger.error("Error fetching notifications", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const count = await getUnreadCount(userId, householdId);
      res.json({ count });
    } catch (error) {
      logger.error("Error fetching unread count", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      await markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking notification read", { error, notificationId: req.params.id });
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/mark-all-read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      await markAllNotificationsRead(userId, householdId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking all notifications read", { error, userId, householdId });
      res.status(500).json({ message: "Failed to mark all notifications read" });
    }
  });

  app.get("/api/notification-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const settings = await getNotificationSettings(userId);
      res.json(settings || {});
    } catch (error) {
      logger.error("Error fetching notification settings", { error, userId });
      res.status(500).json({ message: "Failed to fetch notification settings" });
    }
  });

  app.patch("/api/notification-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const settings = await upsertNotificationSettings(userId, householdId, req.body);
      res.json(settings);
    } catch (error) {
      logger.error("Error updating notification settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update notification settings" });
    }
  });

  // ============================================
  // AI SUGGESTIONS ROUTES
  // ============================================

  app.get("/api/suggestions", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const suggestions = await getSmartSuggestions(householdId);
      res.json(suggestions);
    } catch (error) {
      logger.error("Error fetching suggestions", { error, householdId });
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  // ============================================
  // PUSH NOTIFICATIONS ROUTES
  // ============================================

  app.get("/api/push/vapid-key", async (_req, res) => {
    const publicKey = getVapidPublicKey();
    res.json({ 
      publicKey,
      enabled: isPushEnabled(),
    });
  });

  app.post("/api/push/subscribe", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { endpoint, keys, userAgent } = req.body;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }

      await savePushSubscription({
        userId,
        householdId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || req.headers["user-agent"],
      });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error saving push subscription", { error, userId, householdId });
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.post("/api/push/unsubscribe", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({ message: "Endpoint required" });
      }

      await removePushSubscription(userId, endpoint);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error removing push subscription", { error, userId });
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  app.get("/api/push/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const subscriptions = await getUserSubscriptions(userId);
      res.json(subscriptions.map(s => ({ 
        id: s.id, 
        endpoint: s.endpoint,
        createdAt: s.createdAt 
      })));
    } catch (error) {
      logger.error("Error fetching subscriptions", { error, userId });
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  });

  // ============================================
  // GLOBAL SEARCH ROUTE
  // ============================================

  app.get("/api/search", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const query = (req.query.q as string || "").toLowerCase().trim();
      const types = (req.query.types as string || "tasks,updates,vendors,preferences").split(",");
      const status = req.query.status as string;
      
      if (!query || query.length < 2) {
        return res.json({ tasks: [], updates: [], vendors: [], preferences: [], totalCount: 0 });
      }

      const results: {
        tasks: any[];
        updates: any[];
        vendors: any[];
        preferences: any[];
        totalCount: number;
      } = { tasks: [], updates: [], vendors: [], preferences: [], totalCount: 0 };

      if (types.includes("tasks")) {
        const allTasks = await storage.getTasks(householdId);
        results.tasks = allTasks.filter(t => {
          const matchesQuery = t.title.toLowerCase().includes(query) || 
                               (t.description?.toLowerCase().includes(query)) ||
                               (t.location?.toLowerCase().includes(query));
          const matchesStatus = !status || t.status === status;
          return matchesQuery && matchesStatus;
        }).slice(0, 10);
      }

      if (types.includes("updates")) {
        const allUpdates = await storage.getUpdates(householdId);
        results.updates = allUpdates.filter(u => 
          u.text.toLowerCase().includes(query)
        ).slice(0, 10);
      }

      if (types.includes("vendors")) {
        const allVendors = await storage.getVendors(householdId);
        results.vendors = allVendors.filter(v => 
          v.name.toLowerCase().includes(query) ||
          (v.notes?.toLowerCase().includes(query)) ||
          (v.category?.toLowerCase().includes(query))
        ).slice(0, 10);
      }

      if (types.includes("preferences")) {
        const allPreferences = await storage.getPreferences(householdId);
        results.preferences = allPreferences.filter(p => 
          p.key.toLowerCase().includes(query) ||
          p.value.toLowerCase().includes(query)
        ).slice(0, 10);
      }

      results.totalCount = results.tasks.length + results.updates.length + 
                          results.vendors.length + results.preferences.length;

      res.json(results);
    } catch (error) {
      logger.error("Error searching", { error, userId, householdId });
      res.status(500).json({ message: "Failed to search" });
    }
  });
}
