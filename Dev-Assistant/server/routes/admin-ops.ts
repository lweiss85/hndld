import type { Request, Response, NextFunction } from "express";
import { AppError, badRequest, forbidden, internalError, notFound, unauthorized, validationError } from "../lib/errors";
import type { Router } from "express";
import express from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { criticalLimiter } from "../lib/rate-limit";
import { createBackupZip, listBackups, deleteBackup, getBackupPath, getBackupSettings, saveBackupSettings, exportAllData } from "../services/backup";
import { restartScheduledBackups } from "../services/scheduler";
import { encryptVaultValue } from "../services/vault-encryption";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { insertOrganizationSchema, insertHouseholdSchema } from "@shared/schema";
import { createReadStream, existsSync } from "fs";
import { join, basename } from "path";
import { enqueueJob, JOB_NAMES } from "../lib/queue";
import { z } from "zod";
import * as googleCalendar from "../services/google-calendar";

const householdContext = householdContextMiddleware;

async function getUserProfile(userId: string) {
  return storage.getUserProfile(userId);
}

export function registerAdminOpsRoutes(app: Router) {
  // ============================================
  // ADMIN ROUTES (Assistant only)
  // ============================================

  /**
   * @openapi
   * /admin/export:
   *   get:
   *     summary: Export all data as JSON
   *     description: Export all application data as a JSON document
   *     tags: [Export]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Exported data with timestamp
   *       403:
   *         description: Only assistants can export data
   *       500:
   *         description: Failed to export data
   */
  app.get("/admin/export", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can export data");
      }

      const data = await exportAllData();
      res.json({
        exportedAt: new Date().toISOString(),
        data,
      });
    } catch (error) {
      logger.error("Error exporting data", { error, userId });
      next(internalError("Failed to export data"));
    }
  });

  /**
   * @openapi
   * /admin/sync-calendars:
   *   post:
   *     summary: Trigger calendar sync
   *     description: Manually trigger an immediate calendar synchronization
   *     tags: [Export]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Calendar sync triggered successfully
   *       403:
   *         description: Only assistants can trigger sync
   *       500:
   *         description: Failed to trigger sync
   */
  app.post("/admin/sync-calendars", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can trigger sync");
      }

      const jobId = await enqueueJob(JOB_NAMES.CALENDAR_SYNC, { immediate: true });
      
      res.json({
        message: "Calendar sync job enqueued",
        jobId,
      });
    } catch (error: any) {
      logger.error("Error triggering sync", { error, userId });
      next(internalError("Failed to trigger sync"));
    }
  });

  /**
   * @openapi
   * /admin/backup:
   *   post:
   *     summary: Create a backup
   *     description: Create a new backup ZIP file of the application data
   *     tags: [Backup]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Backup created successfully with download URL
   *       403:
   *         description: Only assistants can create backups
   *       500:
   *         description: Failed to create backup
   */
  app.post("/admin/backup", criticalLimiter, isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can create backups");
      }

      const backupPath = await createBackupZip(false);
      const filename = basename(backupPath);
      
      res.json({
        message: "Backup created successfully",
        filename,
        downloadUrl: `/api/admin/backups/${filename}/download`,
      });
    } catch (error) {
      logger.error("Error creating backup", { error, userId });
      next(internalError("Failed to create backup"));
    }
  });

  /**
   * @openapi
   * /admin/backups:
   *   get:
   *     summary: List all backups
   *     description: Retrieve a list of all available backup files
   *     tags: [Backup]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of backup files
   *       403:
   *         description: Only assistants can view backups
   *       500:
   *         description: Failed to list backups
   */
  app.get("/admin/backups", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can view backups");
      }

      const backups = listBackups();
      res.json(backups);
    } catch (error) {
      logger.error("Error listing backups", { error, userId });
      next(internalError("Failed to list backups"));
    }
  });

  /**
   * @openapi
   * /admin/backups/{filename}/download:
   *   get:
   *     summary: Download a backup
   *     description: Download a specific backup file by filename
   *     tags: [Backup]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: filename
   *         required: true
   *         schema:
   *           type: string
   *         description: Backup filename
   *     responses:
   *       200:
   *         description: Backup file download
   *         content:
   *           application/zip:
   *             schema:
   *               type: string
   *               format: binary
   *       403:
   *         description: Only assistants can download backups
   *       404:
   *         description: Backup not found
   *       500:
   *         description: Failed to download backup
   */
  app.get("/admin/backups/:filename/download", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can download backups");
      }

      const filepath = getBackupPath(req.params.filename);
      if (!filepath) {
        throw notFound("Backup not found");
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
      createReadStream(filepath).pipe(res);
    } catch (error) {
      logger.error("Error downloading backup", { error, userId, filename: req.params.filename });
      next(internalError("Failed to download backup"));
    }
  });

  /**
   * @openapi
   * /admin/backups/{filename}:
   *   delete:
   *     summary: Delete a backup
   *     description: Delete a specific backup file by filename
   *     tags: [Backup]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: filename
   *         required: true
   *         schema:
   *           type: string
   *         description: Backup filename
   *     responses:
   *       200:
   *         description: Backup deleted successfully
   *       403:
   *         description: Only assistants can delete backups
   *       404:
   *         description: Backup not found
   *       500:
   *         description: Failed to delete backup
   */
  app.delete("/admin/backups/:filename", criticalLimiter, isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can delete backups");
      }

      const success = deleteBackup(req.params.filename);
      if (!success) {
        throw notFound("Backup not found");
      }

      res.json({ message: "Backup deleted successfully" });
    } catch (error) {
      logger.error("Error deleting backup", { error, userId, filename: req.params.filename });
      next(internalError("Failed to delete backup"));
    }
  });

  /**
   * @openapi
   * /admin/migrate-vault-encryption:
   *   post:
   *     summary: Migrate vault items to encrypted storage
   *     description: Encrypt all unencrypted sensitive vault items
   *     tags: [Vault Settings]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Migration results with counts
   *       500:
   *         description: Failed to migrate vault encryption
   */
  app.post("/admin/migrate-vault-encryption", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const accessItems = await storage.getAccessItems(householdId);
      
      let migratedCount = 0;
      let skippedCount = 0;
      
      for (const item of accessItems) {
        if (item.isEncrypted || !item.isSensitive) {
          skippedCount++;
          continue;
        }
        
        try {
          const encryptedValue = encryptVaultValue(item.value);
          await storage.updateAccessItem(householdId, item.id, {
            value: encryptedValue,
            isEncrypted: true,
          });
          migratedCount++;
        } catch (error) {
          logger.error("Failed to migrate vault item", { error, itemId: item.id, householdId });
        }
      }
      
      res.json({
        success: true,
        message: `Migration complete. ${migratedCount} items encrypted, ${skippedCount} skipped.`,
        migratedCount,
        skippedCount,
      });
    } catch (error) {
      logger.error("Error migrating vault encryption", { error, householdId });
      next(internalError("Failed to migrate vault encryption"));
    }
  });

  /**
   * @openapi
   * /admin/backup-settings:
   *   get:
   *     summary: Get backup settings
   *     description: Retrieve the current backup schedule and configuration
   *     tags: [Backup]
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Backup settings object
   *       403:
   *         description: Only assistants can view backup settings
   *       500:
   *         description: Failed to get backup settings
   */
  app.get("/admin/backup-settings", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can view backup settings");
      }

      const settings = getBackupSettings();
      res.json(settings);
    } catch (error) {
      logger.error("Error getting backup settings", { error, userId });
      next(internalError("Failed to get backup settings"));
    }
  });

  /**
   * @openapi
   * /admin/backup-settings:
   *   patch:
   *     summary: Update backup settings
   *     description: Update the backup schedule and configuration
   *     tags: [Backup]
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
   *         description: Updated backup settings
   *       403:
   *         description: Only assistants can update backup settings
   *       500:
   *         description: Failed to update backup settings
   */
  app.patch("/admin/backup-settings", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can update backup settings");
      }

      const settings = saveBackupSettings(req.body);
      restartScheduledBackups();
      
      res.json(settings);
    } catch (error) {
      logger.error("Error updating backup settings", { error, userId });
      next(internalError("Failed to update backup settings"));
    }
  });

  // ============================================================
  // Organization Management Routes (Multi-tenancy foundation)
  // ============================================================
  
  /**
   * @openapi
   * /organizations/mine:
   *   get:
   *     summary: Get current user's organization
   *     description: Retrieve the organization owned by the current user
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     responses:
   *       200:
   *         description: Organization object
   *       404:
   *         description: No organization found
   *       500:
   *         description: Failed to get organization
   */
  app.get("/organizations/mine", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganizationByOwner(userId);
      
      if (!org) {
        throw notFound("No organization found");
      }
      
      res.json(org);
    } catch (error) {
      logger.error("Error getting organization", { error, userId });
      next(internalError("Failed to get organization"));
    }
  });

  /**
   * @openapi
   * /organizations:
   *   get:
   *     summary: List organizations
   *     description: Get all organizations owned by the current user
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     responses:
   *       200:
   *         description: List of organizations
   *       500:
   *         description: Failed to get organizations
   */
  app.get("/organizations", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const orgs = await storage.getOrganizationsByOwner(userId);
      res.json(orgs);
    } catch (error) {
      logger.error("Error getting organizations", { error, userId });
      next(internalError("Failed to get organizations"));
    }
  });

  /**
   * @openapi
   * /organizations/{id}:
   *   get:
   *     summary: Get organization by ID
   *     description: Retrieve a specific organization by its ID
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Organization ID
   *     responses:
   *       200:
   *         description: Organization object
   *       403:
   *         description: Access denied
   *       404:
   *         description: Organization not found
   *       500:
   *         description: Failed to get organization
   */
  app.get("/organizations/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        throw notFound("Organization not found");
      }
      
      // Only owner can view their organization details
      if (org.ownerId !== userId) {
        throw forbidden("Access denied");
      }
      
      res.json(org);
    } catch (error) {
      logger.error("Error getting organization", { error, userId, organizationId: req.params.id });
      next(internalError("Failed to get organization"));
    }
  });

  /**
   * @openapi
   * /organizations:
   *   post:
   *     summary: Create a new organization
   *     description: Create a new organization for managing multiple households
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       201:
   *         description: Organization created
   *       400:
   *         description: Invalid data
   *       403:
   *         description: Only assistants can create organizations
   *       500:
   *         description: Failed to create organization
   */
  app.post("/organizations", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      // Only assistants can create organizations
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can create organizations");
      }

      const validatedData = insertOrganizationSchema.parse({
        ...req.body,
        ownerId: userId,
      });
      
      const org = await storage.createOrganization(validatedData);
      res.status(201).json(org);
    } catch (error) {
      logger.error("Error creating organization", { error, userId });
      if (error instanceof z.ZodError) {
        return next(validationError("Invalid data", error.errors));
      }
      next(internalError("Failed to create organization"));
    }
  });

  /**
   * @openapi
   * /organizations/{id}:
   *   patch:
   *     summary: Update organization
   *     description: Update an existing organization's details
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Organization ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Updated organization
   *       403:
   *         description: Access denied
   *       404:
   *         description: Organization not found
   *       500:
   *         description: Failed to update organization
   */
  app.patch("/organizations/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        throw notFound("Organization not found");
      }
      
      // Only owner can update their organization
      if (org.ownerId !== userId) {
        throw forbidden("Access denied");
      }

      const updatedOrg = await storage.updateOrganization(req.params.id, req.body);
      res.json(updatedOrg);
    } catch (error) {
      logger.error("Error updating organization", { error, userId, organizationId: req.params.id });
      next(internalError("Failed to update organization"));
    }
  });

  /**
   * @openapi
   * /organizations/{id}/households:
   *   get:
   *     summary: Get organization households
   *     description: Retrieve all households within an organization
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Organization ID
   *     responses:
   *       200:
   *         description: List of households
   *       403:
   *         description: Access denied
   *       404:
   *         description: Organization not found
   *       500:
   *         description: Failed to get organization households
   */
  app.get("/organizations/:id/households", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        throw notFound("Organization not found");
      }
      
      // Only owner can view households in their organization
      if (org.ownerId !== userId) {
        throw forbidden("Access denied");
      }

      const householdsData = await storage.getHouseholdsByOrganization(req.params.id);
      res.json(householdsData);
    } catch (error) {
      logger.error("Error getting organization households", { error, userId, organizationId: req.params.id });
      next(internalError("Failed to get organization households"));
    }
  });

  /**
   * @openapi
   * /organizations/{id}/households:
   *   post:
   *     summary: Create household in organization
   *     description: Create a new household within an organization
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Organization ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       201:
   *         description: Household created
   *       400:
   *         description: Invalid data
   *       403:
   *         description: Only assistants can create households or access denied
   *       404:
   *         description: Organization not found
   *       500:
   *         description: Failed to create household
   */
  app.post("/organizations/:id/households", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can create households");
      }

      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        throw notFound("Organization not found");
      }
      
      if (org.ownerId !== userId) {
        throw forbidden("Access denied");
      }

      const validatedData = insertHouseholdSchema.parse({
        ...req.body,
        organizationId: req.params.id,
      });
      
      const household = await storage.createHousehold(validatedData);
      res.status(201).json(household);
    } catch (error) {
      logger.error("Error creating household", { error, userId, organizationId: req.params.id });
      if (error instanceof z.ZodError) {
        return next(validationError("Invalid data", error.errors));
      }
      next(internalError("Failed to create household"));
    }
  });

  /**
   * @openapi
   * /households/{id}/organization:
   *   patch:
   *     summary: Link household to organization
   *     description: Link an existing household to an organization
   *     tags: [Organization]
   *     security:
   *       - session: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Household ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               organizationId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Household linked to organization
   *       403:
   *         description: Only assistants can link households or invalid organization
   *       500:
   *         description: Failed to link household to organization
   */
  app.patch("/households/:id/organization", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can link households");
      }

      const { organizationId } = req.body;
      
      if (organizationId) {
        const org = await storage.getOrganization(organizationId);
        if (!org || org.ownerId !== userId) {
          throw forbidden("Invalid organization");
        }
      }

      const household = await storage.updateHousehold(req.params.id, { organizationId });
      res.json(household);
    } catch (error) {
      logger.error("Error linking household", { error, userId, householdId: req.params.id });
      next(internalError("Failed to link household to organization"));
    }
  });

  // ============================================
  // BILLING ROUTES (Phase 1)
  // ============================================

  /**
   * @openapi
   * /billing/plans:
   *   get:
   *     summary: Get subscription plans
   *     description: Retrieve available subscription plans and demo mode status
   *     tags: [Billing]
   *     responses:
   *       200:
   *         description: Available plans and demo mode status
   */
  app.get("/billing/plans", async (_req, res) => {
    const { SUBSCRIPTION_PLANS, isDemoMode } = await import("../services/billing");
    res.json({
      plans: SUBSCRIPTION_PLANS,
      demoMode: isDemoMode(),
    });
  });

  /**
   * @openapi
   * /billing/subscription:
   *   get:
   *     summary: Get current subscription
   *     description: Retrieve the current user's subscription status and plan
   *     tags: [Billing]
   *     security:
   *       - session: []
   *     responses:
   *       200:
   *         description: Current subscription details
   *       500:
   *         description: Failed to fetch subscription
   */
  app.get("/billing/subscription", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (!profile?.organizationId) {
        const { isDemoMode } = await import("../services/billing");
        return res.json({
          plan: "FREE",
          status: "ACTIVE",
          demoMode: isDemoMode(),
        });
      }

      const { getSubscription } = await import("../services/billing");
      const subscription = await getSubscription(profile.organizationId);
      res.json(subscription);
    } catch (error) {
      logger.error("Error fetching subscription", { error, userId });
      next(internalError("Failed to fetch subscription"));
    }
  });

  /**
   * @openapi
   * /billing/checkout:
   *   post:
   *     summary: Create checkout session
   *     description: Create a Stripe checkout session for plan subscription
   *     tags: [Billing]
   *     security:
   *       - session: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [planId]
   *             properties:
   *               planId:
   *                 type: string
   *               successUrl:
   *                 type: string
   *               cancelUrl:
   *                 type: string
   *     responses:
   *       200:
   *         description: Checkout session created
   *       400:
   *         description: Organization required for billing
   *       403:
   *         description: Only assistants can manage billing
   *       500:
   *         description: Failed to create checkout session
   */
  app.post("/billing/checkout", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can manage billing");
      }

      if (!profile?.organizationId) {
        throw badRequest("Organization required for billing");
      }

      const { planId, successUrl, cancelUrl } = req.body;
      const { createCheckoutSession } = await import("../services/billing");
      
      const session = await createCheckoutSession(
        profile.organizationId,
        planId,
        successUrl || `${req.headers.origin}/billing?success=true`,
        cancelUrl || `${req.headers.origin}/billing?canceled=true`
      );

      res.json(session);
    } catch (error) {
      logger.error("Error creating checkout", { error, userId });
      next(internalError("Failed to create checkout session"));
    }
  });

  /**
   * @openapi
   * /billing/portal:
   *   post:
   *     summary: Create billing portal session
   *     description: Create a Stripe billing portal session for managing subscriptions
   *     tags: [Billing]
   *     security:
   *       - session: []
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               returnUrl:
   *                 type: string
   *     responses:
   *       200:
   *         description: Billing portal session created
   *       400:
   *         description: Organization required
   *       403:
   *         description: Only assistants can manage billing
   *       500:
   *         description: Failed to create billing portal
   */
  app.post("/billing/portal", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can manage billing");
      }

      if (!profile?.organizationId) {
        throw badRequest("Organization required");
      }

      const { createBillingPortalSession } = await import("../services/billing");
      const session = await createBillingPortalSession(
        profile.organizationId,
        req.body.returnUrl || `${req.headers.origin}/billing`
      );

      res.json(session);
    } catch (error) {
      logger.error("Error creating portal session", { error, userId });
      next(internalError("Failed to create billing portal"));
    }
  });

  /**
   * @openapi
   * /billing/invoices:
   *   get:
   *     summary: Get invoices
   *     description: Retrieve billing invoices for the user's organization
   *     tags: [Billing]
   *     security:
   *       - session: []
   *     responses:
   *       200:
   *         description: List of invoices
   *       500:
   *         description: Failed to fetch invoices
   */
  app.get("/billing/invoices", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (!profile?.organizationId) {
        return res.json([]);
      }

      const { getInvoices } = await import("../services/billing");
      const invoiceList = await getInvoices(profile.organizationId);
      res.json(invoiceList);
    } catch (error) {
      logger.error("Error fetching invoices", { error, userId });
      next(internalError("Failed to fetch invoices"));
    }
  });

  /**
   * @openapi
   * /billing/webhooks:
   *   post:
   *     summary: Handle Stripe webhook
   *     description: Process incoming Stripe webhook events
   *     tags: [Billing]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook processed successfully
   *       500:
   *         description: Webhook handler failed
   */
  app.post("/billing/webhooks", express.raw({ type: "application/json" }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      const { handleStripeWebhook } = await import("../services/billing");
      const result = await handleStripeWebhook(req.body, signature);
      
      if (result.isServerError) {
        throw internalError(result.error || "Webhook processing failed");
      }
      
      res.json(result);
    } catch (error) {
      logger.error("Webhook error", { error });
      next(internalError("Webhook handler failed"));
    }
  });
}
