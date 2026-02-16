import type { Request, Response } from "express";
import type { Router } from "express";
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

export function registerAdminRoutes(app: Router) {
  // ============================================
  // AUDIT LOG ROUTES
  // ============================================
  
  /**
   * @openapi
   * /audit-logs:
   *   get:
   *     summary: Get audit logs
   *     description: Retrieve audit logs for the current household with optional filters
   *     tags: [Audit]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: entityType
   *         schema:
   *           type: string
   *         description: Filter by entity type
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter logs after this date
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter logs before this date
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: List of audit log entries
   *       403:
   *         description: Only assistants can view audit logs
   *       500:
   *         description: Failed to fetch audit logs
   */
  app.get("/audit-logs", isAuthenticated, householdContext, requirePermission("CAN_VIEW_AUDIT_LOG"), async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /vault/settings:
   *   get:
   *     summary: Get vault settings
   *     description: Retrieve vault PIN and auto-lock settings for the household
   *     tags: [Vault Settings]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Vault settings object
   *       403:
   *         description: Only assistants can manage vault settings
   *       500:
   *         description: Failed to fetch vault settings
   */
  app.get("/vault/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /vault/set-pin:
   *   post:
   *     summary: Set vault PIN
   *     description: Set or update the vault PIN for the household
   *     tags: [Vault Settings]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [pin]
   *             properties:
   *               pin:
   *                 type: string
   *                 minLength: 4
   *     responses:
   *       200:
   *         description: PIN set successfully
   *       400:
   *         description: PIN must be at least 4 characters
   *       403:
   *         description: Only assistants can set vault PIN
   *       500:
   *         description: Failed to set vault PIN
   */
  app.post("/vault/set-pin", authLimiter, isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /vault/verify-pin:
   *   post:
   *     summary: Verify vault PIN
   *     description: Verify the vault PIN to unlock the vault for a session
   *     tags: [Vault Settings]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [pin]
   *             properties:
   *               pin:
   *                 type: string
   *     responses:
   *       200:
   *         description: PIN verified, vault unlocked
   *       400:
   *         description: PIN required or no PIN set
   *       401:
   *         description: Invalid PIN
   *       500:
   *         description: Failed to verify PIN
   */
  app.post("/vault/verify-pin", authLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /handoff:
   *   get:
   *     summary: Generate handoff packet HTML
   *     description: Generate a full HTML handoff packet for the household
   *     tags: [Handoff]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Handoff packet as HTML
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   *       403:
   *         description: Only assistants can generate handoff packets
   *       500:
   *         description: Failed to generate handoff packet
   */
  app.get("/handoff", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /handoff/data:
   *   get:
   *     summary: Get handoff data as JSON
   *     description: Retrieve the raw handoff packet data for the household
   *     tags: [Handoff]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Handoff data object
   *       403:
   *         description: Only assistants can access handoff data
   *       500:
   *         description: Failed to generate handoff data
   */
  app.get("/handoff/data", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /moments/generate:
   *   get:
   *     summary: Generate moment tasks
   *     description: Create tasks for upcoming important dates in the household
   *     tags: [Handoff]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Number of tasks created
   *       403:
   *         description: Only assistants can generate moment tasks
   *       500:
   *         description: Failed to generate moment tasks
   */
  app.get("/moments/generate", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /notifications:
   *   get:
   *     summary: Get notifications
   *     description: Retrieve all notifications for the current user in the household
   *     tags: [Notifications]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of notifications
   *       500:
   *         description: Failed to fetch notifications
   */
  app.get("/notifications", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /notifications/unread-count:
   *   get:
   *     summary: Get unread notification count
   *     description: Retrieve the count of unread notifications for the current user
   *     tags: [Notifications]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Unread notification count
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 count:
   *                   type: integer
   *       500:
   *         description: Failed to fetch unread count
   */
  app.get("/notifications/unread-count", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /notifications/{id}/read:
   *   patch:
   *     summary: Mark notification as read
   *     description: Mark a specific notification as read
   *     tags: [Notifications]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Notification ID
   *     responses:
   *       200:
   *         description: Notification marked as read
   *       500:
   *         description: Failed to mark notification read
   */
  app.patch("/notifications/:id/read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      await markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking notification read", { error, notificationId: req.params.id });
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  /**
   * @openapi
   * /notifications/mark-all-read:
   *   post:
   *     summary: Mark all notifications as read
   *     description: Mark all notifications as read for the current user in the household
   *     tags: [Notifications]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: All notifications marked as read
   *       500:
   *         description: Failed to mark all notifications read
   */
  app.post("/notifications/mark-all-read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /notification-settings:
   *   get:
   *     summary: Get notification settings
   *     description: Retrieve notification preferences for the current user
   *     tags: [Notifications]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Notification settings object
   *       500:
   *         description: Failed to fetch notification settings
   */
  app.get("/notification-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const settings = await getNotificationSettings(userId);
      res.json(settings || {});
    } catch (error) {
      logger.error("Error fetching notification settings", { error, userId });
      res.status(500).json({ message: "Failed to fetch notification settings" });
    }
  });

  /**
   * @openapi
   * /notification-settings:
   *   patch:
   *     summary: Update notification settings
   *     description: Update notification preferences for the current user
   *     tags: [Notifications]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Updated notification settings
   *       500:
   *         description: Failed to update notification settings
   */
  app.patch("/notification-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /suggestions:
   *   get:
   *     summary: Get smart suggestions
   *     description: Retrieve AI-powered smart suggestions for the household
   *     tags: [Suggestions]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of smart suggestions
   *       500:
   *         description: Failed to fetch suggestions
   */
  app.get("/suggestions", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /push/vapid-key:
   *   get:
   *     summary: Get VAPID public key
   *     description: Retrieve the VAPID public key for push notification subscription
   *     tags: [Push Notifications]
   *     responses:
   *       200:
   *         description: VAPID public key and push enabled status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 publicKey:
   *                   type: string
   *                 enabled:
   *                   type: boolean
   */
  app.get("/push/vapid-key", async (_req, res) => {
    const publicKey = getVapidPublicKey();
    res.json({ 
      publicKey,
      enabled: isPushEnabled(),
    });
  });

  /**
   * @openapi
   * /push/subscribe:
   *   post:
   *     summary: Subscribe to push notifications
   *     description: Save a push notification subscription for the current user
   *     tags: [Push Notifications]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [endpoint, keys]
   *             properties:
   *               endpoint:
   *                 type: string
   *               keys:
   *                 type: object
   *                 required: [p256dh, auth]
   *                 properties:
   *                   p256dh:
   *                     type: string
   *                   auth:
   *                     type: string
   *               userAgent:
   *                 type: string
   *     responses:
   *       200:
   *         description: Subscription saved successfully
   *       400:
   *         description: Invalid subscription data
   *       500:
   *         description: Failed to save subscription
   */
  app.post("/push/subscribe", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /push/unsubscribe:
   *   post:
   *     summary: Unsubscribe from push notifications
   *     description: Remove a push notification subscription for the current user
   *     tags: [Push Notifications]
   *     security:
   *       - session: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [endpoint]
   *             properties:
   *               endpoint:
   *                 type: string
   *     responses:
   *       200:
   *         description: Subscription removed successfully
   *       400:
   *         description: Endpoint required
   *       500:
   *         description: Failed to remove subscription
   */
  app.post("/push/unsubscribe", isAuthenticated, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /push/subscriptions:
   *   get:
   *     summary: Get push subscriptions
   *     description: Retrieve all push notification subscriptions for the current user
   *     tags: [Push Notifications]
   *     security:
   *       - session: []
   *     responses:
   *       200:
   *         description: List of push subscriptions
   *       500:
   *         description: Failed to fetch subscriptions
   */
  app.get("/push/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /search:
   *   get:
   *     summary: Global search
   *     description: Search across tasks, updates, vendors, and preferences in the household
   *     tags: [Search]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *           minLength: 2
   *         description: Search query (minimum 2 characters)
   *       - in: query
   *         name: types
   *         schema:
   *           type: string
   *           default: tasks,updates,vendors,preferences
   *         description: Comma-separated list of entity types to search
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *         description: Filter tasks by status
   *     responses:
   *       200:
   *         description: Search results grouped by type
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 tasks:
   *                   type: array
   *                 updates:
   *                   type: array
   *                 vendors:
   *                   type: array
   *                 preferences:
   *                   type: array
   *                 totalCount:
   *                   type: integer
   *       500:
   *         description: Failed to search
   */
  app.get("/search", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
