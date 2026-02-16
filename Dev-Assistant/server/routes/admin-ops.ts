import type { Request, Response } from "express";
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
import { triggerImmediateSync } from "../services/scheduler";
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

  // Export all data as JSON
  app.get("/admin/export", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can export data" });
      }

      const data = await exportAllData();
      res.json({
        exportedAt: new Date().toISOString(),
        data,
      });
    } catch (error) {
      logger.error("Error exporting data", { error, userId });
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  app.post("/admin/sync-calendars", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can trigger sync" });
      }

      const result = await triggerImmediateSync();
      
      res.json({
        message: "Calendar sync triggered",
        ...result,
      });
    } catch (error: any) {
      logger.error("Error triggering sync", { error, userId });
      res.status(500).json({ message: "Failed to trigger sync" });
    }
  });

  // Create a backup ZIP
  app.post("/admin/backup", criticalLimiter, isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create backups" });
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
      res.status(500).json({ message: "Failed to create backup" });
    }
  });

  // List all backups
  app.get("/admin/backups", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view backups" });
      }

      const backups = listBackups();
      res.json(backups);
    } catch (error) {
      logger.error("Error listing backups", { error, userId });
      res.status(500).json({ message: "Failed to list backups" });
    }
  });

  // Download a backup
  app.get("/admin/backups/:filename/download", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can download backups" });
      }

      const filepath = getBackupPath(req.params.filename);
      if (!filepath) {
        return res.status(404).json({ message: "Backup not found" });
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
      createReadStream(filepath).pipe(res);
    } catch (error) {
      logger.error("Error downloading backup", { error, userId, filename: req.params.filename });
      res.status(500).json({ message: "Failed to download backup" });
    }
  });

  // Delete a backup
  app.delete("/admin/backups/:filename", criticalLimiter, isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can delete backups" });
      }

      const success = deleteBackup(req.params.filename);
      if (!success) {
        return res.status(404).json({ message: "Backup not found" });
      }

      res.json({ message: "Backup deleted successfully" });
    } catch (error) {
      logger.error("Error deleting backup", { error, userId, filename: req.params.filename });
      res.status(500).json({ message: "Failed to delete backup" });
    }
  });

  // Migrate existing vault items to encrypted storage
  app.post("/admin/migrate-vault-encryption", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to migrate vault encryption" });
    }
  });

  // Get backup settings
  app.get("/admin/backup-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view backup settings" });
      }

      const settings = getBackupSettings();
      res.json(settings);
    } catch (error) {
      logger.error("Error getting backup settings", { error, userId });
      res.status(500).json({ message: "Failed to get backup settings" });
    }
  });

  // Update backup settings
  app.patch("/admin/backup-settings", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update backup settings" });
      }

      const settings = saveBackupSettings(req.body);
      restartScheduledBackups();
      
      res.json(settings);
    } catch (error) {
      logger.error("Error updating backup settings", { error, userId });
      res.status(500).json({ message: "Failed to update backup settings" });
    }
  });

  // ============================================================
  // Organization Management Routes (Multi-tenancy foundation)
  // ============================================================
  
  // Get current user's organization
  app.get("/organizations/mine", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganizationByOwner(userId);
      
      if (!org) {
        return res.status(404).json({ message: "No organization found" });
      }
      
      res.json(org);
    } catch (error) {
      logger.error("Error getting organization", { error, userId });
      res.status(500).json({ message: "Failed to get organization" });
    }
  });

  // Get all organizations owned by current user
  app.get("/organizations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const orgs = await storage.getOrganizationsByOwner(userId);
      res.json(orgs);
    } catch (error) {
      logger.error("Error getting organizations", { error, userId });
      res.status(500).json({ message: "Failed to get organizations" });
    }
  });

  // Get organization by ID
  app.get("/organizations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Only owner can view their organization details
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(org);
    } catch (error) {
      logger.error("Error getting organization", { error, userId, organizationId: req.params.id });
      res.status(500).json({ message: "Failed to get organization" });
    }
  });

  // Create a new organization (for assistants managing multiple households)
  app.post("/organizations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      // Only assistants can create organizations
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create organizations" });
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
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  // Update organization
  app.patch("/organizations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Only owner can update their organization
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedOrg = await storage.updateOrganization(req.params.id, req.body);
      res.json(updatedOrg);
    } catch (error) {
      logger.error("Error updating organization", { error, userId, organizationId: req.params.id });
      res.status(500).json({ message: "Failed to update organization" });
    }
  });

  // Get households within an organization
  app.get("/organizations/:id/households", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Only owner can view households in their organization
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const householdsData = await storage.getHouseholdsByOrganization(req.params.id);
      res.json(householdsData);
    } catch (error) {
      logger.error("Error getting organization households", { error, userId, organizationId: req.params.id });
      res.status(500).json({ message: "Failed to get organization households" });
    }
  });

  // Create household within an organization
  app.post("/organizations/:id/households", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create households" });
      }

      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
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
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create household" });
    }
  });

  // Link existing household to organization
  app.patch("/households/:id/organization", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can link households" });
      }

      const { organizationId } = req.body;
      
      if (organizationId) {
        const org = await storage.getOrganization(organizationId);
        if (!org || org.ownerId !== userId) {
          return res.status(403).json({ message: "Invalid organization" });
        }
      }

      const household = await storage.updateHousehold(req.params.id, { organizationId });
      res.json(household);
    } catch (error) {
      logger.error("Error linking household", { error, userId, householdId: req.params.id });
      res.status(500).json({ message: "Failed to link household to organization" });
    }
  });

  // ============================================
  // BILLING ROUTES (Phase 1)
  // ============================================

  app.get("/billing/plans", async (_req, res) => {
    const { SUBSCRIPTION_PLANS, isDemoMode } = await import("../services/billing");
    res.json({
      plans: SUBSCRIPTION_PLANS,
      demoMode: isDemoMode(),
    });
  });

  app.get("/billing/subscription", isAuthenticated, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.post("/billing/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage billing" });
      }

      if (!profile?.organizationId) {
        return res.status(400).json({ message: "Organization required for billing" });
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
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.post("/billing/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage billing" });
      }

      if (!profile?.organizationId) {
        return res.status(400).json({ message: "Organization required" });
      }

      const { createBillingPortalSession } = await import("../services/billing");
      const session = await createBillingPortalSession(
        profile.organizationId,
        req.body.returnUrl || `${req.headers.origin}/billing`
      );

      res.json(session);
    } catch (error) {
      logger.error("Error creating portal session", { error, userId });
      res.status(500).json({ message: "Failed to create billing portal" });
    }
  });

  app.get("/billing/invoices", isAuthenticated, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/billing/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      const { handleStripeWebhook } = await import("../services/billing");
      const result = await handleStripeWebhook(req.body, signature);
      
      if (result.isServerError) {
        return res.status(500).json({ message: result.error, received: false });
      }
      
      res.json(result);
    } catch (error) {
      logger.error("Webhook error", { error });
      res.status(500).json({ message: "Webhook handler failed" });
    }
  });
}
