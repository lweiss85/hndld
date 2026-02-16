import type { Request, Response } from "express";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { wsManager } from "../services/websocket";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { spendingItems, userProfiles, files, fileLinks, households } from "@shared/schema";
import { escapeHtml } from "../lib/escape-html";
import { getStorageProvider } from "../services/storage-provider";

const householdContext = householdContextMiddleware;

export function registerSpendingRoutes(app: Router) {
  /**
   * @openapi
   * /spending:
   *   get:
   *     tags:
   *       - Spending
   *     summary: List spending items
   *     description: Returns spending items for the current household. Supports optional filtering by serviceType and pagination via page/limit query params. Returns a paginated object when limit > 0, otherwise returns a plain array.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *       - in: query
   *         name: serviceType
   *         schema:
   *           type: string
   *           enum: [CLEANING, PA]
   *         description: Filter by service type
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number (used with limit)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Items per page. 0 returns all items as an array.
   *     responses:
   *       200:
   *         description: Spending items retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: array
   *                   items:
   *                     $ref: '#/components/schemas/SpendingItem'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/SpendingItem'
   *                     pagination:
   *                       type: object
   *                       properties:
   *                         page:
   *                           type: integer
   *                         limit:
   *                           type: integer
   *                         total:
   *                           type: integer
   *                         totalPages:
   *                           type: integer
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/spending", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      const serviceType = req.query.serviceType as string | undefined;
      
      let spending = await storage.getSpending(householdId);
      
      if (userRole === "STAFF") {
        spending = spending.filter(s => s.serviceType === "CLEANING");
      } else if (serviceType && ["CLEANING", "PA"].includes(serviceType)) {
        spending = spending.filter(s => s.serviceType === serviceType);
      }
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 0;
      
      if (limit > 0) {
        const start = (page - 1) * limit;
        const paginated = spending.slice(start, start + limit);
        res.json({
          data: paginated,
          pagination: {
            page,
            limit,
            total: spending.length,
            totalPages: Math.ceil(spending.length / limit),
          },
        });
      } else {
        res.json(spending);
      }
    } catch (error) {
      logger.error("Error fetching spending", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch spending" });
    }
  });
  
  /**
   * @openapi
   * /spending:
   *   post:
   *     tags:
   *       - Spending
   *     summary: Create a spending item
   *     description: Creates a new spending item in the current household.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               amount:
   *                 type: integer
   *                 description: Amount in cents
   *               category:
   *                 type: string
   *               vendor:
   *                 type: string
   *               note:
   *                 type: string
   *               serviceType:
   *                 type: string
   *                 enum: [CLEANING, PA]
   *     responses:
   *       201:
   *         description: Spending item created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SpendingItem'
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/spending", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const item = await storage.createSpendingItem({
        ...req.body,
        createdBy: userId,
        householdId,
      });
      
      wsManager.broadcast("spending:created", { id: item.id }, householdId, userId);
      
      res.status(201).json(item);
    } catch (error) {
      logger.error("Error creating spending item", { error, householdId, userId });
      res.status(500).json({ message: "Failed to create spending item" });
    }
  });

  /**
   * @openapi
   * /spending/{id}/status:
   *   patch:
   *     tags:
   *       - Spending
   *     summary: Update spending item status
   *     description: Updates the status of a spending item as part of the payment workflow. Validates status transitions based on user role.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Spending item ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - status
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [DRAFT, NEEDS_APPROVAL, APPROVED, PAYMENT_SENT, RECONCILED]
   *               paymentMethodUsed:
   *                 type: string
   *                 enum: [VENMO, ZELLE, CASH_APP, PAYPAL]
   *                 description: Payment method used (when status is PAYMENT_SENT)
   *               paymentNote:
   *                 type: string
   *                 description: Optional note for the payment
   *               tipAmount:
   *                 type: number
   *                 minimum: 0
   *                 maximum: 50000
   *                 description: Tip amount in cents (when status is PAYMENT_SENT)
   *     responses:
   *       200:
   *         description: Spending item status updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SpendingItem'
   *       400:
   *         description: Invalid status or payment method
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Insufficient permissions for this status transition
   *       404:
   *         description: Spending item not found
   *       500:
   *         description: Internal server error
   */
  app.patch("/spending/:id/status", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;
      const userRole = req.householdRole;
      
      // Validate status transition
      const validStatuses = ["DRAFT", "NEEDS_APPROVAL", "APPROVED", "PAYMENT_SENT", "RECONCILED"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      // Get current item
      const item = await storage.getSpendingItem(householdId, id);
      if (!item) {
        return res.status(404).json({ message: "Spending item not found" });
      }
      
      // Permission checks based on status transition
      // ASSISTANT can: DRAFT -> NEEDS_APPROVAL, PAYMENT_SENT -> RECONCILED
      // CLIENT can: NEEDS_APPROVAL -> PAYMENT_SENT (when they pay)
      const isAssistant = userRole === "ASSISTANT";
      const isClient = userRole === "CLIENT";
      
      if (status === "NEEDS_APPROVAL" && !isAssistant) {
        return res.status(403).json({ message: "Only assistants can request reimbursement" });
      }
      if (status === "PAYMENT_SENT" && !isClient) {
        return res.status(403).json({ message: "Only clients can mark as paid" });
      }
      if (status === "RECONCILED" && !isAssistant) {
        return res.status(403).json({ message: "Only assistants can reconcile payments" });
      }
      
      // Update the item
      const updateData: any = { status };
      if (status === "PAYMENT_SENT") {
        updateData.paidAt = new Date();
        // Include tip amount and payment method when marking as paid
        const { paymentMethodUsed, paymentNote, tipAmount } = req.body;
        const validPaymentMethods = ["VENMO", "ZELLE", "CASH_APP", "PAYPAL"];
        if (paymentMethodUsed) {
          if (!validPaymentMethods.includes(paymentMethodUsed)) {
            return res.status(400).json({ message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(", ")}` });
          }
          updateData.paymentMethodUsed = paymentMethodUsed;
        }
        if (paymentNote) {
          updateData.paymentNote = paymentNote;
        }
        if (typeof tipAmount === "number" && tipAmount >= 0 && tipAmount <= 50000) {
          updateData.tipAmount = tipAmount;
        }
      }
      if (status === "RECONCILED") {
        updateData.reconciledAt = new Date();
      }
      
      const updated = await storage.updateSpendingItem(householdId, id, updateData);
      
      wsManager.broadcast("spending:updated", { id, status }, householdId, userId);
      
      // Audit log
      const { logAudit } = await import("../services/audit");
      await logAudit({
        householdId,
        userId,
        action: "SPENDING_STATUS_UPDATED",
        entityType: "SPENDING",
        entityId: id,
        before: { status: item.status },
        after: { status },
      });
      
      res.json(updated);
    } catch (error) {
      logger.error("Error updating spending status", { error, householdId, userId, id });
      res.status(500).json({ message: "Failed to update spending status" });
    }
  });

  /**
   * @openapi
   * /org/payment-profile:
   *   get:
   *     tags:
   *       - Payment Settings
   *     summary: Get organization payment profile
   *     description: Retrieves the payment profile for the organization linked to the current household. Requires CAN_MANAGE_SETTINGS permission.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     responses:
   *       200:
   *         description: Organization payment profile retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: string
   *                 venmoUsername:
   *                   type: string
   *                   nullable: true
   *                 zelleRecipient:
   *                   type: string
   *                   nullable: true
   *                 cashAppCashtag:
   *                   type: string
   *                   nullable: true
   *                 paypalMeHandle:
   *                   type: string
   *                   nullable: true
   *                 defaultPaymentMethod:
   *                   type: string
   *                 payNoteTemplate:
   *                   type: string
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Insufficient permissions
   *       404:
   *         description: Household not linked to an organization
   *       500:
   *         description: Internal server error
   */
  app.get("/org/payment-profile", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Get the household's organization
      const household = await storage.getHousehold(householdId);
      if (!household?.organizationId) {
        return res.status(404).json({ message: "Household is not linked to an organization. Create an organization first." });
      }
      
      // Get or create payment profile with defaults
      let profile = await storage.getOrganizationPaymentProfile(household.organizationId);
      if (!profile) {
        profile = await storage.upsertOrganizationPaymentProfile(household.organizationId, {});
      }
      
      res.json(profile);
    } catch (error) {
      logger.error("Error fetching org payment profile", { error, householdId });
      res.status(500).json({ message: "Failed to fetch payment profile" });
    }
  });

  /**
   * @openapi
   * /org/payment-profile:
   *   put:
   *     tags:
   *       - Payment Settings
   *     summary: Update organization payment profile
   *     description: Creates or updates the payment profile for the organization linked to the current household. Requires CAN_MANAGE_SETTINGS permission.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               venmoUsername:
   *                 type: string
   *                 description: Venmo username (@ prefix is stripped automatically)
   *               zelleRecipient:
   *                 type: string
   *                 description: Zelle recipient email or phone
   *                 maxLength: 100
   *               cashAppCashtag:
   *                 type: string
   *                 description: Cash App cashtag ($ prefix is stripped automatically)
   *               paypalMeHandle:
   *                 type: string
   *                 description: PayPal.me handle
   *               defaultPaymentMethod:
   *                 type: string
   *                 enum: [VENMO, ZELLE, CASH_APP, PAYPAL]
   *                 default: VENMO
   *               payNoteTemplate:
   *                 type: string
   *                 description: Payment note template (max 500 chars). Supports placeholders {ref}, {category}, {date}, {vendor}, {amount}.
   *                 maxLength: 500
   *     responses:
   *       200:
   *         description: Organization payment profile updated successfully
   *       400:
   *         description: Invalid input (bad Venmo username, Zelle recipient, Cash App cashtag, PayPal handle, or template too long)
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Insufficient permissions
   *       404:
   *         description: Household not linked to an organization
   *       500:
   *         description: Internal server error
   */
  app.put("/org/payment-profile", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      // Get the household's organization
      const household = await storage.getHousehold(householdId);
      if (!household?.organizationId) {
        return res.status(404).json({ message: "Household is not linked to an organization. Create an organization first." });
      }
      
      const { venmoUsername, zelleRecipient, cashAppCashtag, paypalMeHandle, defaultPaymentMethod, payNoteTemplate } = req.body;
      
      // Validate Venmo username (strip @ and validate chars)
      let cleanVenmo = venmoUsername;
      if (venmoUsername) {
        cleanVenmo = venmoUsername.replace(/^@/, '').trim();
        if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanVenmo)) {
          return res.status(400).json({ message: "Invalid Venmo username. Use letters, numbers, underscores, or dashes." });
        }
      }
      
      // Basic Zelle validation (email or phone)
      if (zelleRecipient && zelleRecipient.length > 100) {
        return res.status(400).json({ message: "Zelle recipient too long" });
      }
      
      // Validate Cash App cashtag (strip $ and validate)
      let cleanCashApp = cashAppCashtag;
      if (cashAppCashtag) {
        cleanCashApp = cashAppCashtag.replace(/^\$/, '').trim();
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(cleanCashApp)) {
          return res.status(400).json({ message: "Invalid Cash App cashtag. Must start with a letter, 1-20 chars." });
        }
      }
      
      // Validate PayPal.me handle
      let cleanPayPal = paypalMeHandle;
      if (paypalMeHandle) {
        cleanPayPal = paypalMeHandle.trim();
        if (!/^[a-zA-Z0-9]{1,50}$/.test(cleanPayPal)) {
          return res.status(400).json({ message: "Invalid PayPal.me handle. Use letters and numbers only." });
        }
      }
      
      // Template length limit
      if (payNoteTemplate && payNoteTemplate.length > 500) {
        return res.status(400).json({ message: "Pay note template too long (max 500 chars)" });
      }
      
      const profile = await storage.upsertOrganizationPaymentProfile(household.organizationId, {
        venmoUsername: cleanVenmo || null,
        zelleRecipient: zelleRecipient || null,
        cashAppCashtag: cleanCashApp || null,
        paypalMeHandle: cleanPayPal || null,
        defaultPaymentMethod: defaultPaymentMethod || "VENMO",
        payNoteTemplate: payNoteTemplate || "hndld • Reimbursement {ref} • {category} • {date}",
      });
      
      // Audit log
      const { logAudit } = await import("../services/audit");
      await logAudit({
        householdId,
        userId,
        action: "ORG_PAYMENT_PROFILE_UPDATED",
        entityType: "SETTINGS",
        entityId: profile.id,
        after: { organizationId: household.organizationId },
      });
      
      res.json(profile);
    } catch (error) {
      logger.error("Error updating org payment profile", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update payment profile" });
    }
  });

  /**
   * @openapi
   * /household/payment-settings:
   *   get:
   *     tags:
   *       - Payment Settings
   *     summary: Get household payment settings
   *     description: Retrieves the household-level payment override settings along with the organization payment profile if available.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     responses:
   *       200:
   *         description: Household payment settings retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 override:
   *                   type: object
   *                   nullable: true
   *                   description: Household-specific payment overrides
   *                 orgProfile:
   *                   type: object
   *                   nullable: true
   *                   description: Organization-level payment profile
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/household/payment-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Get household's override settings
      let override = await storage.getHouseholdPaymentOverride(householdId);
      
      // Also get the org profile if available (for display purposes)
      const household = await storage.getHousehold(householdId);
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      
      res.json({
        override: override || null,
        orgProfile,
      });
    } catch (error) {
      logger.error("Error fetching household payment settings", { error, householdId });
      res.status(500).json({ message: "Failed to fetch payment settings" });
    }
  });

  /**
   * @openapi
   * /household/payment-settings:
   *   put:
   *     tags:
   *       - Payment Settings
   *     summary: Update household payment settings
   *     description: Creates or updates household-level payment override settings. Requires CAN_MANAGE_SETTINGS permission.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               useOrgDefaults:
   *                 type: boolean
   *                 default: true
   *                 description: Whether to use organization defaults
   *               venmoUsername:
   *                 type: string
   *               zelleRecipient:
   *                 type: string
   *               cashAppCashtag:
   *                 type: string
   *               paypalMeHandle:
   *                 type: string
   *               defaultPaymentMethod:
   *                 type: string
   *                 enum: [VENMO, ZELLE, CASH_APP, PAYPAL]
   *               payNoteTemplate:
   *                 type: string
   *     responses:
   *       200:
   *         description: Household payment settings updated successfully
   *       400:
   *         description: Invalid input
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Insufficient permissions
   *       500:
   *         description: Internal server error
   */
  app.put("/household/payment-settings", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { useOrgDefaults, venmoUsername, zelleRecipient, cashAppCashtag, paypalMeHandle, defaultPaymentMethod, payNoteTemplate } = req.body;
      
      // Validate Venmo username
      let cleanVenmo = venmoUsername;
      if (venmoUsername) {
        cleanVenmo = venmoUsername.replace(/^@/, '').trim();
        if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanVenmo)) {
          return res.status(400).json({ message: "Invalid Venmo username" });
        }
      }
      
      // Validate Cash App cashtag
      let cleanCashApp = cashAppCashtag;
      if (cashAppCashtag) {
        cleanCashApp = cashAppCashtag.replace(/^\$/, '').trim();
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(cleanCashApp)) {
          return res.status(400).json({ message: "Invalid Cash App cashtag" });
        }
      }
      
      // Validate PayPal.me handle
      let cleanPayPal = paypalMeHandle;
      if (paypalMeHandle) {
        cleanPayPal = paypalMeHandle.trim();
        if (!/^[a-zA-Z0-9]{1,50}$/.test(cleanPayPal)) {
          return res.status(400).json({ message: "Invalid PayPal.me handle" });
        }
      }
      
      const override = await storage.upsertHouseholdPaymentOverride(householdId, {
        useOrgDefaults: useOrgDefaults !== false,
        venmoUsername: cleanVenmo || null,
        zelleRecipient: zelleRecipient || null,
        cashAppCashtag: cleanCashApp || null,
        paypalMeHandle: cleanPayPal || null,
        defaultPaymentMethod: defaultPaymentMethod || null,
        payNoteTemplate: payNoteTemplate || null,
      });
      
      // Audit log
      const { logAudit } = await import("../services/audit");
      await logAudit({
        householdId,
        userId: req.user!.claims.sub,
        action: "HOUSEHOLD_PAYMENT_OVERRIDE_UPDATED",
        entityType: "SETTINGS",
        entityId: override.id,
        after: { useOrgDefaults: override.useOrgDefaults },
      });
      
      res.json(override);
    } catch (error) {
      logger.error("Error updating household payment settings", { error, householdId });
      res.status(500).json({ message: "Failed to update payment settings" });
    }
  });

  /**
   * @openapi
   * /spending/{id}/pay-options:
   *   get:
   *     tags:
   *       - Spending
   *     summary: Get payment options for a spending item
   *     description: Returns effective payment information for a specific spending item, including Venmo, Zelle, Cash App, and PayPal details with deep-link URLs pre-filled with amount and reference.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Spending item ID
   *     responses:
   *       200:
   *         description: Payment options retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ref:
   *                   type: string
   *                   description: Payment reference code
   *                 amount:
   *                   type: integer
   *                   description: Amount in cents
   *                 note:
   *                   type: string
   *                   description: Generated payment note
   *                 venmo:
   *                   type: object
   *                   properties:
   *                     enabled:
   *                       type: boolean
   *                     username:
   *                       type: string
   *                       nullable: true
   *                     url:
   *                       type: string
   *                       nullable: true
   *                 zelle:
   *                   type: object
   *                   properties:
   *                     enabled:
   *                       type: boolean
   *                     recipient:
   *                       type: string
   *                       nullable: true
   *                     note:
   *                       type: string
   *                 cashApp:
   *                   type: object
   *                   properties:
   *                     enabled:
   *                       type: boolean
   *                     cashtag:
   *                       type: string
   *                       nullable: true
   *                     url:
   *                       type: string
   *                       nullable: true
   *                 paypal:
   *                   type: object
   *                   properties:
   *                     enabled:
   *                       type: boolean
   *                     handle:
   *                       type: string
   *                       nullable: true
   *                     url:
   *                       type: string
   *                       nullable: true
   *                 preferredMethod:
   *                   type: string
   *                 display:
   *                   type: object
   *                   properties:
   *                     payToLine:
   *                       type: string
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Spending item not found
   *       500:
   *         description: Internal server error
   */
  app.get("/spending/:id/pay-options", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Get spending item
      const spending = await storage.getSpendingItem(householdId, req.params.id);
      if (!spending) {
        return res.status(404).json({ message: "Spending item not found" });
      }
      
      // Resolve effective payment profile
      const household = await storage.getHousehold(householdId);
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      
      const householdOverride = await storage.getHouseholdPaymentOverride(householdId);
      
      // Determine effective values
      const useOrgDefaults = !householdOverride || householdOverride.useOrgDefaults;
      
      const venmoUsername = useOrgDefaults 
        ? orgProfile?.venmoUsername 
        : (householdOverride?.venmoUsername || orgProfile?.venmoUsername);
      
      const zelleRecipient = useOrgDefaults
        ? orgProfile?.zelleRecipient
        : (householdOverride?.zelleRecipient || orgProfile?.zelleRecipient);
      
      const cashAppCashtag = useOrgDefaults
        ? orgProfile?.cashAppCashtag
        : (householdOverride?.cashAppCashtag || orgProfile?.cashAppCashtag);
      
      const paypalMeHandle = useOrgDefaults
        ? orgProfile?.paypalMeHandle
        : (householdOverride?.paypalMeHandle || orgProfile?.paypalMeHandle);
      
      const preferredMethod = useOrgDefaults
        ? (orgProfile?.defaultPaymentMethod || "VENMO")
        : (householdOverride?.defaultPaymentMethod || orgProfile?.defaultPaymentMethod || "VENMO");
      
      const noteTemplate = useOrgDefaults
        ? (orgProfile?.payNoteTemplate || "hndld {ref} • {category}")
        : (householdOverride?.payNoteTemplate || orgProfile?.payNoteTemplate || "hndld {ref} • {category}");
      
      // Generate reference code if not already set
      const ref = spending.paymentReferenceCode || `HN-${spending.id.substring(0, 6).toUpperCase()}`;
      
      // Build payment note from template
      const amount = (spending.amount / 100).toFixed(2);
      const paymentNote = noteTemplate
        .replace(/{ref}/g, ref)
        .replace(/{category}/g, spending.category || "General")
        .replace(/{date}/g, new Date(spending.date || Date.now()).toLocaleDateString())
        .replace(/{vendor}/g, spending.vendor || "")
        .replace(/{amount}/g, `$${amount}`);
      
      // Build payment URLs (Venmo: audience=private ensures transaction is private)
      const venmoUrl = venmoUsername 
        ? `https://venmo.com/${venmoUsername}?txn=pay&amount=${amount}&note=${encodeURIComponent(paymentNote)}&audience=private`
        : null;
      
      const cashAppUrl = cashAppCashtag
        ? `https://cash.app/$${cashAppCashtag}/${amount}`
        : null;
      
      const paypalUrl = paypalMeHandle
        ? `https://paypal.me/${paypalMeHandle}/${amount}`
        : null;
      
      // Build display line
      const payToLine = [
        venmoUsername ? `@${venmoUsername} (Venmo)` : null,
        zelleRecipient ? `${zelleRecipient} (Zelle)` : null,
        cashAppCashtag ? `$${cashAppCashtag} (Cash App)` : null,
        paypalMeHandle ? `${paypalMeHandle} (PayPal)` : null,
      ].filter(Boolean).join(" or ");
      
      res.json({
        ref,
        amount: spending.amount,
        note: paymentNote,
        venmo: {
          enabled: !!venmoUsername,
          username: venmoUsername,
          url: venmoUrl,
        },
        zelle: {
          enabled: !!zelleRecipient,
          recipient: zelleRecipient,
          note: paymentNote,
        },
        cashApp: {
          enabled: !!cashAppCashtag,
          cashtag: cashAppCashtag,
          url: cashAppUrl,
        },
        paypal: {
          enabled: !!paypalMeHandle,
          handle: paypalMeHandle,
          url: paypalUrl,
        },
        preferredMethod,
        display: {
          payToLine: payToLine || "Payment method not set up yet",
        },
      });
    } catch (error) {
      logger.error("Error fetching pay options", { error, householdId });
      res.status(500).json({ message: "Failed to fetch pay options" });
    }
  });

  /**
   * @openapi
   * /pay-options:
   *   get:
   *     tags:
   *       - Payment Settings
   *     summary: Get general payment profile for household
   *     description: Returns the effective payment profile for the current household, resolving organization defaults and household overrides. Accessible by all household members.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     responses:
   *       200:
   *         description: Payment profile retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 venmoUsername:
   *                   type: string
   *                   nullable: true
   *                 zelleRecipient:
   *                   type: string
   *                   nullable: true
   *                 cashAppCashtag:
   *                   type: string
   *                   nullable: true
   *                 paypalMeHandle:
   *                   type: string
   *                   nullable: true
   *                 defaultPaymentMethod:
   *                   type: string
   *                 payNoteTemplate:
   *                   type: string
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/pay-options", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Resolve effective payment profile
      const household = await storage.getHousehold(householdId);
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      
      const householdOverride = await storage.getHouseholdPaymentOverride(householdId);
      
      // Determine effective values
      const useOrgDefaults = !householdOverride || householdOverride.useOrgDefaults;
      
      const venmoUsername = useOrgDefaults 
        ? orgProfile?.venmoUsername 
        : (householdOverride?.venmoUsername || orgProfile?.venmoUsername);
      
      const zelleRecipient = useOrgDefaults
        ? orgProfile?.zelleRecipient
        : (householdOverride?.zelleRecipient || orgProfile?.zelleRecipient);
      
      const cashAppCashtag = useOrgDefaults
        ? orgProfile?.cashAppCashtag
        : (householdOverride?.cashAppCashtag || orgProfile?.cashAppCashtag);
      
      const paypalMeHandle = useOrgDefaults
        ? orgProfile?.paypalMeHandle
        : (householdOverride?.paypalMeHandle || orgProfile?.paypalMeHandle);
      
      const defaultPaymentMethod = useOrgDefaults
        ? (orgProfile?.defaultPaymentMethod || "VENMO")
        : (householdOverride?.defaultPaymentMethod || orgProfile?.defaultPaymentMethod || "VENMO");
      
      const payNoteTemplate = useOrgDefaults
        ? (orgProfile?.payNoteTemplate || "hndld • Reimbursement {ref} • {category} • {date}")
        : (householdOverride?.payNoteTemplate || orgProfile?.payNoteTemplate || "hndld • Reimbursement {ref} • {category} • {date}");
      
      res.json({
        venmoUsername: venmoUsername || null,
        zelleRecipient: zelleRecipient || null,
        cashAppCashtag: cashAppCashtag || null,
        paypalMeHandle: paypalMeHandle || null,
        defaultPaymentMethod,
        payNoteTemplate,
      });
    } catch (error) {
      logger.error("Error fetching pay options", { error, householdId });
      res.status(500).json({ message: "Failed to fetch pay options" });
    }
  });
  
  // ==================== INVOICE ENDPOINTS ====================

  /**
   * @openapi
   * /invoices/send:
   *   post:
   *     tags:
   *       - Invoices
   *     summary: Send an invoice
   *     description: Creates and sends an invoice to the household client. Generates an HTML invoice document with payment instructions, saves it to storage, and creates a notification update. Requires CAN_EDIT_TASKS permission.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - title
   *               - amount
   *             properties:
   *               title:
   *                 type: string
   *                 description: Invoice title / line item description
   *               amount:
   *                 type: integer
   *                 description: Amount in cents
   *               note:
   *                 type: string
   *                 description: Optional note for the invoice
   *               dueDate:
   *                 type: string
   *                 format: date-time
   *                 description: Optional due date for payment
   *     responses:
   *       200:
   *         description: Invoice sent successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 invoiceId:
   *                   type: string
   *                 invoiceNumber:
   *                   type: string
   *                 fileId:
   *                   type: string
   *       400:
   *         description: Title and amount are required
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Insufficient permissions
   *       500:
   *         description: Internal server error
   */
  app.post("/invoices/send", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;
      const { title, amount, note, dueDate } = req.body;

      if (!title || !amount) {
        return res.status(400).json({ message: "Title and amount are required" });
      }

      // Get household for display name
      const household = await storage.getHousehold(householdId);
      
      // Generate invoice number: INV-YYYYMMDD-XXXXX
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const invoiceNumber = `INV-${dateStr}-${randomSuffix}`;

      // Create spending item as invoice
      const spending = await storage.createSpendingItem({
        amount,
        category: "Invoice",
        vendor: "hndld Concierge",
        note: note || null,
        householdId,
        createdBy: userId,
        status: "APPROVED", // Client action is to pay, not approve
        kind: "INVOICE",
        title,
        dueDate: dueDate ? new Date(dueDate) : null,
        invoiceNumber,
        sentAt: now,
        paymentReferenceCode: invoiceNumber,
      });

      // Get payment options for the invoice document
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      const householdOverride = await storage.getHouseholdPaymentOverride(householdId);
      const useOrgDefaults = !householdOverride || householdOverride.useOrgDefaults;
      
      const venmoUsername = useOrgDefaults 
        ? orgProfile?.venmoUsername 
        : (householdOverride?.venmoUsername || orgProfile?.venmoUsername);
      const zelleRecipient = useOrgDefaults
        ? orgProfile?.zelleRecipient
        : (householdOverride?.zelleRecipient || orgProfile?.zelleRecipient);
      const cashAppCashtag = useOrgDefaults
        ? orgProfile?.cashAppCashtag
        : (householdOverride?.cashAppCashtag || orgProfile?.cashAppCashtag);
      const paypalMeHandle = useOrgDefaults
        ? orgProfile?.paypalMeHandle
        : (householdOverride?.paypalMeHandle || orgProfile?.paypalMeHandle);

      // Generate HTML invoice document with escaped user input
      const safeTitle = escapeHtml(title);
      const safeNote = note ? escapeHtml(note) : "";
      const safeHouseholdName = escapeHtml(household?.name || "—");
      const storagePath = `invoices/${invoiceNumber}.html`;
      
      const invoiceHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; color: #1D2A44; }
    .header { border-bottom: 2px solid #E7D8B1; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1D2A44; }
    .invoice-title { font-size: 32px; font-weight: 300; margin: 10px 0; }
    .details { margin: 30px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .amount { font-size: 36px; font-weight: bold; color: #1D2A44; margin: 30px 0; }
    .payment-section { background: #F6F2EA; padding: 20px; border-radius: 8px; margin-top: 30px; }
    .payment-title { font-weight: 600; margin-bottom: 15px; }
    .payment-method { margin: 10px 0; }
    .footer { margin-top: 40px; text-align: center; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">hndld</div>
    <div class="invoice-title">Invoice</div>
  </div>
  
  <div class="details">
    <div class="detail-row"><span>Invoice Number</span><span>${invoiceNumber}</span></div>
    <div class="detail-row"><span>Household</span><span>${safeHouseholdName}</span></div>
    <div class="detail-row"><span>Date</span><span>${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span></div>
    ${dueDate ? `<div class="detail-row"><span>Due Date</span><span>${new Date(dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span></div>` : ""}
  </div>
  
  <div class="detail-row"><span style="font-weight: 600;">${safeTitle}</span></div>
  ${safeNote ? `<div style="color: #666; margin-top: 10px;">${safeNote}</div>` : ""}
  
  <div class="amount">$${(amount / 100).toFixed(2)}</div>
  
  <div class="payment-section">
    <div class="payment-title">Payment Instructions</div>
    ${venmoUsername ? `<div class="payment-method">Venmo: <a href="https://venmo.com/${escapeHtml(venmoUsername)}">@${escapeHtml(venmoUsername)}</a></div>` : ""}
    ${zelleRecipient ? `<div class="payment-method">Zelle: ${escapeHtml(zelleRecipient)}</div>` : ""}
    ${cashAppCashtag ? `<div class="payment-method">Cash App: <a href="https://cash.app/$${escapeHtml(cashAppCashtag)}">$${escapeHtml(cashAppCashtag)}</a></div>` : ""}
    ${paypalMeHandle ? `<div class="payment-method">PayPal: <a href="https://paypal.me/${escapeHtml(paypalMeHandle)}">paypal.me/${escapeHtml(paypalMeHandle)}</a></div>` : ""}
    ${!venmoUsername && !zelleRecipient && !cashAppCashtag && !paypalMeHandle ? `<div class="payment-method">Contact your assistant for payment details.</div>` : ""}
    <div style="margin-top: 10px; font-size: 12px; color: #666;">Reference: ${invoiceNumber}</div>
  </div>
  
  <div class="footer">White-glove household operations, handled.</div>
</body>
</html>`;

      // Write the invoice file to storage
      await getStorageProvider().upload(storagePath, Buffer.from(invoiceHtml, "utf8"), "text/html");

      // Save invoice document to files table
      const [invoiceFile] = await db
        .insert(files)
        .values({
          householdId,
          uploadedBy: userId,
          filename: `${invoiceNumber}.html`,
          storedFilename: `${invoiceNumber}.html`,
          mimeType: "text/html",
          fileSize: Buffer.byteLength(invoiceHtml, "utf8"),
          storageProvider: "LOCAL",
          storagePath,
          category: "DOCUMENT",
          tags: ["invoice", invoiceNumber],
          description: `Invoice ${invoiceNumber} • ${title}`,
        })
        .returning();

      // Link file to spending item
      await db.insert(fileLinks).values({
        fileId: invoiceFile.id,
        entityType: "SPENDING",
        entityId: spending.id,
        linkedBy: userId,
      });

      // Create an update to notify the client
      const amountFormatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount / 100);

      await storage.createUpdate({
        text: `Invoice sent: ${title} • ${amountFormatted}`,
        householdId,
        createdBy: userId,
        receipts: [invoiceFile.id],
      });

      res.json({
        success: true,
        invoiceId: spending.id,
        invoiceNumber,
        fileId: invoiceFile.id,
      });
    } catch (error) {
      logger.error("Error sending invoice", { error, householdId, userId });
      res.status(500).json({ message: "Failed to send invoice" });
    }
  });

  /**
   * @openapi
   * /invoices/pending:
   *   get:
   *     tags:
   *       - Invoices
   *     summary: Get pending invoices summary
   *     description: Returns a summary of unpaid invoices for the current household, including count, total amount, and details of the latest invoice.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *       - in: query
   *         name: serviceType
   *         schema:
   *           type: string
   *           enum: [CLEANING, PA]
   *         description: Filter by service type
   *     responses:
   *       200:
   *         description: Pending invoices summary retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 count:
   *                   type: integer
   *                 totalAmount:
   *                   type: integer
   *                   description: Total amount in cents
   *                 latestInvoiceId:
   *                   type: string
   *                   nullable: true
   *                 latestInvoiceTitle:
   *                   type: string
   *                   nullable: true
   *                 latestInvoiceNumber:
   *                   type: string
   *                   nullable: true
   *                 latestDueDate:
   *                   type: string
   *                   format: date-time
   *                   nullable: true
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/invoices/pending", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const serviceType = req.query.serviceType as string | undefined;

      // Build conditions
      const conditions = [
        eq(spendingItems.householdId, householdId),
        eq(spendingItems.kind, "INVOICE"),
        eq(spendingItems.status, "APPROVED")
      ];
      
      // Filter by service type if provided
      if (serviceType === "CLEANING" || serviceType === "PA") {
        conditions.push(eq(spendingItems.serviceType, serviceType));
      }

      // Get unpaid invoices (APPROVED = ready to pay)
      const pendingInvoices = await db
        .select()
        .from(spendingItems)
        .where(and(...conditions))
        .orderBy(sql`${spendingItems.sentAt} DESC`);

      if (pendingInvoices.length === 0) {
        return res.json({
          count: 0,
          totalAmount: 0,
          latestInvoiceId: null,
          latestInvoiceTitle: null,
          latestInvoiceNumber: null,
          latestDueDate: null,
        });
      }

      const totalAmount = pendingInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const latest = pendingInvoices[0];

      res.json({
        count: pendingInvoices.length,
        totalAmount,
        latestInvoiceId: latest.id,
        latestInvoiceTitle: latest.title,
        latestInvoiceNumber: latest.invoiceNumber,
        latestDueDate: latest.dueDate,
      });
    } catch (error) {
      logger.error("Error fetching pending invoices", { error, householdId });
      res.status(500).json({ message: "Failed to fetch pending invoices" });
    }
  });

  /**
   * @openapi
   * /invoices:
   *   get:
   *     tags:
   *       - Invoices
   *     summary: List all invoices
   *     description: Returns all invoices for the current household, sorted by sent date descending.
   *     security:
   *       - sessionAuth: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Current household ID
   *     responses:
   *       200:
   *         description: Invoices retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/SpendingItem'
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/invoices", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;

      const invoicesList = await db
        .select()
        .from(spendingItems)
        .where(
          and(
            eq(spendingItems.householdId, householdId),
            eq(spendingItems.kind, "INVOICE")
          )
        )
        .orderBy(sql`${spendingItems.sentAt} DESC`);

      res.json(invoicesList);
    } catch (error) {
      logger.error("Error fetching invoices", { error, householdId });
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });
}
