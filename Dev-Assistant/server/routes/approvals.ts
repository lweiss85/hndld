import type { Request, Response, NextFunction } from "express";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { wsManager } from "../services/websocket";
import { serviceScopeMiddleware, getServiceTypeFilter } from "../middleware/serviceScope";
import { z } from "zod";
import { cache, CacheKeys, CacheTTL } from "../lib/cache";
import { forbidden, notFound, badRequest, internalError, validationError } from "../lib/errors";

const householdContext = householdContextMiddleware;

export function registerApprovalsRoutes(app: Router) {
  /**
   * @openapi
   * /approvals:
   *   get:
   *     tags:
   *       - Approvals
   *     summary: List approvals with comments
   *     description: >
   *       Retrieves all approvals for the current household, each enriched with
   *       associated comments. Results are filtered by the caller's role
   *       (STAFF users see only CLEANING approvals related to their own tasks)
   *       and optionally by serviceType query parameter.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *       - in: query
   *         name: serviceType
   *         required: false
   *         schema:
   *           type: string
   *           enum: [CLEANING, PA]
   *         description: Filter approvals by service type
   *     responses:
   *       200:
   *         description: List of approvals with nested comments
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 allOf:
   *                   - $ref: '#/components/schemas/Approval'
   *                   - type: object
   *                     properties:
   *                       comments:
   *                         type: array
   *                         items:
   *                           $ref: '#/components/schemas/Comment'
   *       401:
   *         description: Unauthorized – session required
   *       500:
   *         description: Internal server error
   */
  app.get("/approvals", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      const serviceType = req.query.serviceType as string | undefined;
      
      let approvals = await storage.getApprovals(householdId);
      
      if (userRole === "STAFF") {
        const myTasks = await storage.getTasks(householdId);
        const myTaskIds = new Set(myTasks.filter(t => t.assignedTo === userId).map(t => t.id));
        approvals = approvals.filter(a => 
          a.createdBy === userId || 
          (a.relatedTaskId && myTaskIds.has(a.relatedTaskId))
        );
        // STAFF can only access CLEANING service
        approvals = approvals.filter(a => a.serviceType === "CLEANING");
      } else if (serviceType && ["CLEANING", "PA"].includes(serviceType)) {
        approvals = approvals.filter(a => a.serviceType === serviceType);
      }
      
      const approvalsWithComments = await Promise.all(
        approvals.map(async (approval) => {
          const comments = await storage.getComments("APPROVAL", approval.id);
          return { ...approval, comments };
        })
      );
      
      res.json(approvalsWithComments);
    } catch (error) {
      logger.error("Error fetching approvals", { error, householdId, userId });
      next(internalError("Failed to fetch approvals"));
    }
  });
  
  /**
   * @openapi
   * /approvals:
   *   post:
   *     tags:
   *       - Approvals
   *     summary: Create a new approval
   *     description: >
   *       Creates a new approval record in the current household.
   *       Requires the CAN_EDIT_TASKS permission. Broadcasts an
   *       approval:created WebSocket event on success.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ApprovalInput'
   *     responses:
   *       201:
   *         description: Approval created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Approval'
   *       401:
   *         description: Unauthorized – session required
   *       403:
   *         description: Forbidden – CAN_EDIT_TASKS permission required
   *       500:
   *         description: Internal server error
   */
  app.post("/approvals", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const approval = await storage.createApproval({
        ...req.body,
        createdBy: userId,
        householdId,
      });
      
      wsManager.broadcast("approval:created", { id: approval.id, title: approval.title }, householdId, userId);
      
      res.status(201).json(approval);
    } catch (error) {
      logger.error("Error creating approval", { error, householdId, userId });
      next(internalError("Failed to create approval"));
    }
  });
  
  /**
   * @openapi
   * /approvals/{id}:
   *   patch:
   *     tags:
   *       - Approvals
   *     summary: Update an approval status
   *     description: >
   *       Updates an existing approval's status. Requires the CAN_APPROVE
   *       permission. STAFF users may only update approvals they created or
   *       those related to tasks assigned to them. Broadcasts an
   *       approval:updated WebSocket event on success.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The approval ID to update
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ApprovalStatusUpdate'
   *     responses:
   *       200:
   *         description: Approval updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Approval'
   *       401:
   *         description: Unauthorized – session required
   *       403:
   *         description: Forbidden – CAN_APPROVE permission required or insufficient access
   *       404:
   *         description: Approval not found
   *       500:
   *         description: Internal server error
   */
  app.patch("/approvals/:id", isAuthenticated, householdContext, requirePermission("CAN_APPROVE"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      if (userRole === "STAFF") {
        const existingApproval = await storage.getApproval(householdId, req.params.id);
        if (!existingApproval) {
          throw notFound("Approval not found");
        }
        
        let hasAccess = existingApproval.createdBy === userId;
        if (!hasAccess && existingApproval.relatedTaskId) {
          const myTasks = await storage.getTasks(householdId);
          const myTaskIds = new Set(myTasks.filter(t => t.assignedTo === userId).map(t => t.id));
          hasAccess = myTaskIds.has(existingApproval.relatedTaskId);
        }
        
        if (!hasAccess) {
          throw forbidden("You can only update approvals you created or related to your assigned tasks");
        }
      }
      
      const approval = await storage.updateApproval(householdId, req.params.id, req.body);
      if (!approval) {
        throw notFound("Approval not found");
      }
      
      wsManager.broadcast("approval:updated", { id: approval.id, status: approval.status }, householdId, userId);
      
      res.json(approval);
    } catch (error) {
      logger.error("Error updating approval", { error, householdId, userId });
      next(internalError("Failed to update approval"));
    }
  });
  
  /**
   * @openapi
   * /updates:
   *   get:
   *     tags:
   *       - Updates
   *     summary: List updates with comments
   *     description: >
   *       Retrieves all updates for the current household, each enriched with
   *       associated comments. Supports optional pagination via page and limit
   *       query parameters. STAFF users see only their own CLEANING updates.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *       - in: query
   *         name: serviceType
   *         required: false
   *         schema:
   *           type: string
   *           enum: [CLEANING, PA]
   *         description: Filter updates by service type
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of items per page (0 returns all)
   *     responses:
   *       200:
   *         description: >
   *           List of updates with nested comments. When limit > 0, returns a
   *           paginated wrapper with data and pagination metadata.
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: array
   *                   items:
   *                     allOf:
   *                       - $ref: '#/components/schemas/Update'
   *                       - type: object
   *                         properties:
   *                           comments:
   *                             type: array
   *                             items:
   *                               $ref: '#/components/schemas/Comment'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Update'
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
   *         description: Unauthorized – session required
   *       500:
   *         description: Internal server error
   */
  app.get("/updates", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      const serviceType = req.query.serviceType as string | undefined;
      
      let updates = await storage.getUpdates(householdId);
      
      if (userRole === "STAFF") {
        updates = updates.filter(u => u.createdBy === userId);
        // STAFF can only access CLEANING service
        updates = updates.filter(u => u.serviceType === "CLEANING");
      } else if (serviceType && ["CLEANING", "PA"].includes(serviceType)) {
        updates = updates.filter(u => u.serviceType === serviceType);
      }
      
      const updatesWithComments = await Promise.all(
        updates.map(async (update) => {
          const comments = await storage.getComments("UPDATE", update.id);
          return { ...update, comments };
        })
      );
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 0;
      
      if (limit > 0) {
        const start = (page - 1) * limit;
        const paginated = updatesWithComments.slice(start, start + limit);
        res.json({
          data: paginated,
          pagination: {
            page,
            limit,
            total: updatesWithComments.length,
            totalPages: Math.ceil(updatesWithComments.length / limit),
          },
        });
      } else {
        res.json(updatesWithComments);
      }
    } catch (error) {
      logger.error("Error fetching updates", { error, householdId, userId });
      next(internalError("Failed to fetch updates"));
    }
  });
  
  /**
   * @openapi
   * /updates:
   *   post:
   *     tags:
   *       - Updates
   *     summary: Create a new update
   *     description: >
   *       Creates a new update record in the current household.
   *       Requires the CAN_CREATE_UPDATE permission. Broadcasts an
   *       update:created WebSocket event on success.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateInput'
   *     responses:
   *       201:
   *         description: Update created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Update'
   *       401:
   *         description: Unauthorized – session required
   *       403:
   *         description: Forbidden – CAN_CREATE_UPDATE permission required
   *       500:
   *         description: Internal server error
   */
  app.post("/updates", isAuthenticated, householdContext, requirePermission("CAN_CREATE_UPDATE"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const update = await storage.createUpdate({
        ...req.body,
        createdBy: userId,
        householdId,
      });
      
      wsManager.broadcast("update:created", { id: update.id }, householdId, userId);
      
      res.status(201).json(update);
    } catch (error) {
      logger.error("Error creating update", { error, householdId, userId });
      next(internalError("Failed to create update"));
    }
  });
  
  /**
   * @openapi
   * /updates/{id}/reactions:
   *   post:
   *     tags:
   *       - Updates
   *     summary: Toggle emoji reaction on an update
   *     description: >
   *       Toggles an emoji reaction on the specified update. If the user has
   *       already reacted with the same emoji, the reaction is removed;
   *       otherwise the reaction is added.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The update ID to react to
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - emoji
   *             properties:
   *               emoji:
   *                 type: string
   *                 description: The emoji character to toggle
   *     responses:
   *       200:
   *         description: Update with toggled reaction
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Update'
   *       401:
   *         description: Unauthorized – session required
   *       404:
   *         description: Update not found
   *       500:
   *         description: Internal server error
   */
  app.post("/updates/:id/reactions", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { emoji } = req.body;
      
      const update = await storage.getUpdate(householdId, req.params.id);
      if (!update) {
        throw notFound("Update not found");
      }
      
      const reactions = (update.reactions as Record<string, string[]>) || {};
      
      if (!reactions[emoji]) {
        reactions[emoji] = [];
      }
      
      const userIndex = reactions[emoji].indexOf(userId);
      if (userIndex === -1) {
        reactions[emoji].push(userId);
      } else {
        reactions[emoji].splice(userIndex, 1);
      }
      
      const updatedUpdate = await storage.updateUpdate(householdId, req.params.id, { reactions });
      res.json(updatedUpdate);
    } catch (error) {
      logger.error("Error updating reactions", { error, householdId, userId });
      next(internalError("Failed to update reactions"));
    }
  });
  
  /**
   * @openapi
   * /requests:
   *   get:
   *     tags:
   *       - Requests
   *     summary: List requests
   *     description: Retrieves all requests for the current household.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     responses:
   *       200:
   *         description: List of requests
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Request'
   *       401:
   *         description: Unauthorized – session required
   *       500:
   *         description: Internal server error
   */
  app.get("/requests", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const requests = await storage.getRequests(householdId);
      res.json(requests);
    } catch (error) {
      logger.error("Error fetching requests", { error, householdId, userId });
      next(internalError("Failed to fetch requests"));
    }
  });
  
  /**
   * @openapi
   * /requests:
   *   post:
   *     tags:
   *       - Requests
   *     summary: Create a new request
   *     description: >
   *       Creates a new request in the current household. Requires the
   *       CAN_CREATE_REQUESTS permission. The optional dueAt field is
   *       converted to a Date. Broadcasts a request:created WebSocket event.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             allOf:
   *               - $ref: '#/components/schemas/RequestInput'
   *               - type: object
   *                 properties:
   *                   dueAt:
   *                     type: string
   *                     format: date-time
   *                     nullable: true
   *                     description: Optional due date for the request
   *     responses:
   *       201:
   *         description: Request created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Request'
   *       401:
   *         description: Unauthorized – session required
   *       403:
   *         description: Forbidden – CAN_CREATE_REQUESTS permission required
   *       500:
   *         description: Internal server error
   */
  app.post("/requests", isAuthenticated, householdContext, requirePermission("CAN_CREATE_REQUESTS"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      // Convert dueAt string to Date if provided
      const requestData = {
        ...req.body,
        createdBy: userId,
        householdId,
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null,
      };
      
      const request = await storage.createRequest(requestData);
      
      wsManager.broadcast("request:created", { id: request.id, title: request.title }, householdId, userId);
      
      res.status(201).json(request);
    } catch (error) {
      logger.error("Error creating request", { error, householdId, userId });
      next(internalError("Failed to create request"));
    }
  });

  /**
   * @openapi
   * /requests/{id}:
   *   patch:
   *     tags:
   *       - Requests
   *     summary: Update a request
   *     description: >
   *       Updates an existing request. Requires the CAN_UPDATE_REQUEST
   *       permission. Broadcasts a request:updated WebSocket event on success.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The request ID to update
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RequestUpdate'
   *     responses:
   *       200:
   *         description: Request updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Request'
   *       401:
   *         description: Unauthorized – session required
   *       403:
   *         description: Forbidden – CAN_UPDATE_REQUEST permission required
   *       404:
   *         description: Request not found
   *       500:
   *         description: Internal server error
   */
  app.patch("/requests/:id", isAuthenticated, householdContext, requirePermission("CAN_UPDATE_REQUEST"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;
      const updated = await storage.updateRequest(householdId, req.params.id, req.body);
      if (!updated) {
        throw notFound("Request not found");
      }
      wsManager.broadcast("request:updated", { id: updated.id }, householdId, userId);
      res.json(updated);
    } catch (error) {
      logger.error("Error updating request", { error, householdId, userId });
      next(internalError("Failed to update request"));
    }
  });
  
  /**
   * @openapi
   * /comments:
   *   post:
   *     tags:
   *       - Comments
   *     summary: Create a comment
   *     description: >
   *       Creates a new comment associated with an entity (approval, update,
   *       request, etc.) identified by entityType and entityId.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - entityType
   *               - entityId
   *               - text
   *             properties:
   *               entityType:
   *                 type: string
   *                 description: The type of entity being commented on
   *               entityId:
   *                 type: string
   *                 description: The ID of the entity being commented on
   *               text:
   *                 type: string
   *                 description: The comment text
   *     responses:
   *       201:
   *         description: Comment created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Comment'
   *       401:
   *         description: Unauthorized – session required
   *       500:
   *         description: Internal server error
   */
  app.post("/comments", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      
      const comment = await storage.createComment({
        ...req.body,
        userId,
      });
      
      res.status(201).json(comment);
    } catch (error) {
      logger.error("Error creating comment", { error, userId });
      next(internalError("Failed to create comment"));
    }
  });
  
  /**
   * @openapi
   * /vendors:
   *   get:
   *     tags:
   *       - Vendors
   *     summary: List vendors
   *     description: Retrieves all vendors for the current household.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     responses:
   *       200:
   *         description: List of vendors
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Vendor'
   *       401:
   *         description: Unauthorized – session required
   *       500:
   *         description: Internal server error
   */
  app.get("/vendors", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const vendors = await cache.getOrSet(
        CacheKeys.vendors(householdId),
        () => storage.getVendors(householdId),
        CacheTTL.MEDIUM
      );
      res.json(vendors);
    } catch (error) {
      logger.error("Error fetching vendors", { error, householdId, userId });
      next(internalError("Failed to fetch vendors"));
    }
  });
  
  /**
   * @openapi
   * /vendors:
   *   post:
   *     tags:
   *       - Vendors
   *     summary: Create a new vendor
   *     description: Creates a new vendor record in the current household.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/VendorInput'
   *     responses:
   *       201:
   *         description: Vendor created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Vendor'
   *       401:
   *         description: Unauthorized – session required
   *       500:
   *         description: Internal server error
   */
  app.post("/vendors", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const vendor = await storage.createVendor({
        ...req.body,
        householdId,
      });
      cache.invalidate(CacheKeys.vendors(householdId));
      
      res.status(201).json(vendor);
    } catch (error) {
      logger.error("Error creating vendor", { error, householdId, userId });
      next(internalError("Failed to create vendor"));
    }
  });

  /**
   * @openapi
   * /reactions:
   *   get:
   *     tags:
   *       - Reactions
   *     summary: Get reaction counts
   *     description: >
   *       Retrieves aggregated reaction counts and the current user's reactions
   *       for a set of entities identified by entityType and entityIds.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *       - in: query
   *         name: entityType
   *         required: true
   *         schema:
   *           type: string
   *         description: The type of entities to fetch reactions for
   *       - in: query
   *         name: entityIds
   *         required: true
   *         schema:
   *           type: string
   *         description: Comma-separated list of entity IDs
   *     responses:
   *       200:
   *         description: Reaction counts and user reactions
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 reactions:
   *                   type: object
   *                   additionalProperties:
   *                     type: object
   *                     additionalProperties:
   *                       type: integer
   *                   description: Map of entityId to reactionType counts
   *                 userReactions:
   *                   type: object
   *                   additionalProperties:
   *                     type: string
   *                   description: Map of entityId to current user's reaction type
   *       401:
   *         description: Unauthorized – session required
   *       500:
   *         description: Internal server error
   */
  // Reactions API
  app.get("/reactions", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const entityType = req.query.entityType as string;
      const entityIds = (req.query.entityIds as string || "").split(",").filter(Boolean);
      
      if (!entityType || entityIds.length === 0) {
        return res.json({ reactions: {}, userReactions: {} });
      }
      
      const allReactions = await storage.getReactions(entityType, entityIds, householdId);
      
      // Group reactions by entityId and reactionType for counts
      const reactionCounts: Record<string, Record<string, number>> = {};
      const userReactions: Record<string, string> = {};
      
      for (const reaction of allReactions) {
        if (!reactionCounts[reaction.entityId]) {
          reactionCounts[reaction.entityId] = {};
        }
        if (!reactionCounts[reaction.entityId][reaction.reactionType]) {
          reactionCounts[reaction.entityId][reaction.reactionType] = 0;
        }
        reactionCounts[reaction.entityId][reaction.reactionType]++;
        
        if (reaction.userId === userId) {
          userReactions[reaction.entityId] = reaction.reactionType;
        }
      }
      
      res.json({ reactions: reactionCounts, userReactions });
    } catch (error) {
      logger.error("Error fetching reactions", { error, userId, householdId });
      next(internalError("Failed to fetch reactions"));
    }
  });
  
  /**
   * @openapi
   * /reactions:
   *   post:
   *     tags:
   *       - Reactions
   *     summary: Create or toggle a reaction
   *     description: >
   *       Creates, updates, or toggles off a reaction on an entity. The request
   *       body is validated with Zod. If the user already has the same reaction
   *       type on the entity, the reaction is removed (toggled off). Verifies
   *       the target entity exists and belongs to the user's household. For
   *       NEED_DETAILS or PLEASE_ADJUST reactions with a note, an auto-comment
   *       is also created.
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: The household context identifier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - entityType
   *               - entityId
   *               - reactionType
   *             properties:
   *               entityType:
   *                 type: string
   *                 enum: [TASK, APPROVAL, UPDATE, REQUEST]
   *                 description: The type of entity to react to
   *               entityId:
   *                 type: string
   *                 minLength: 1
   *                 description: The ID of the entity to react to
   *               reactionType:
   *                 type: string
   *                 enum: [LOOKS_GOOD, NEED_DETAILS, PLEASE_ADJUST, LOVE_IT, SAVE_THIS]
   *                 description: The type of reaction
   *               note:
   *                 type: string
   *                 description: Optional note (auto-creates a comment for NEED_DETAILS/PLEASE_ADJUST)
   *     responses:
   *       200:
   *         description: Reaction toggled or upserted successfully
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: object
   *                   properties:
   *                     action:
   *                       type: string
   *                       enum: [removed]
   *                     entityId:
   *                       type: string
   *                     reactionType:
   *                       type: string
   *                 - type: object
   *                   properties:
   *                     action:
   *                       type: string
   *                       enum: [created, updated]
   *                     reaction:
   *                       $ref: '#/components/schemas/Reaction'
   *       400:
   *         description: Invalid request body – Zod validation failed
   *       401:
   *         description: Unauthorized – session required
   *       404:
   *         description: Target entity not found
   *       500:
   *         description: Internal server error
   */
  app.post("/reactions", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      // Validate request body with Zod
      const reactionValidation = z.object({
        entityType: z.enum(["TASK", "APPROVAL", "UPDATE", "REQUEST"]),
        entityId: z.string().min(1),
        reactionType: z.enum(["LOOKS_GOOD", "NEED_DETAILS", "PLEASE_ADJUST", "LOVE_IT", "SAVE_THIS"]),
        note: z.string().optional(),
      });
      
      const parseResult = reactionValidation.safeParse(req.body);
      if (!parseResult.success) {
        throw validationError("Invalid request body", parseResult.error.errors);
      }
      
      const { entityType, entityId, reactionType, note } = parseResult.data;
      
      // Verify entity exists and belongs to user's household (multi-tenant security)
      let entity: { householdId: string } | null | undefined;
      switch (entityType) {
        case "TASK":
          entity = await storage.getTask(householdId, entityId);
          break;
        case "UPDATE":
          entity = await storage.getUpdate(householdId, entityId);
          break;
        case "APPROVAL":
          entity = await storage.getApproval(householdId, entityId);
          break;
        case "REQUEST":
          entity = await storage.getRequest(householdId, entityId);
          break;
      }
      
      if (!entity) {
        throw notFound("Entity not found");
      }
      
      // Check if user already has this exact reaction (toggle off)
      const existing = await storage.getReaction(entityType, entityId, userId);
      
      if (existing && existing.reactionType === reactionType) {
        // Toggle off - delete the reaction
        await storage.deleteReaction(entityType, entityId, userId, householdId);
        return res.json({ action: "removed", entityId, reactionType });
      }
      
      // Create or update reaction
      const reaction = await storage.upsertReaction({
        entityType,
        entityId,
        reactionType,
        note: note || null,
        userId,
        householdId,
      });
      
      // If note provided for NEED_DETAILS or PLEASE_ADJUST, also create a comment
      if (note && (reactionType === "NEED_DETAILS" || reactionType === "PLEASE_ADJUST")) {
        const prefix = reactionType === "NEED_DETAILS" ? "Question: " : "Adjustment needed: ";
        await storage.createComment({
          entityType,
          entityId,
          userId,
          text: prefix + note,
        });
      }
      
      res.json({ action: existing ? "updated" : "created", reaction });
    } catch (error) {
      logger.error("Error creating/updating reaction", { error, userId, householdId });
      next(internalError("Failed to save reaction"));
    }
  });
}
