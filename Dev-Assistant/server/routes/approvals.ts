import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { wsManager } from "../services/websocket";
import { serviceScopeMiddleware, getServiceTypeFilter } from "../middleware/serviceScope";
import { z } from "zod";

const householdContext = householdContextMiddleware;

export function registerApprovalsRoutes(app: Express) {
  app.get("/api/approvals", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to fetch approvals" });
    }
  });
  
  app.post("/api/approvals", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to create approval" });
    }
  });
  
  app.patch("/api/approvals/:id", isAuthenticated, householdContext, requirePermission("CAN_APPROVE"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      if (userRole === "STAFF") {
        const existingApproval = await storage.getApproval(householdId, req.params.id);
        if (!existingApproval) {
          return res.status(404).json({ message: "Approval not found" });
        }
        
        let hasAccess = existingApproval.createdBy === userId;
        if (!hasAccess && existingApproval.relatedTaskId) {
          const myTasks = await storage.getTasks(householdId);
          const myTaskIds = new Set(myTasks.filter(t => t.assignedTo === userId).map(t => t.id));
          hasAccess = myTaskIds.has(existingApproval.relatedTaskId);
        }
        
        if (!hasAccess) {
          return res.status(403).json({ message: "You can only update approvals you created or related to your assigned tasks" });
        }
      }
      
      const approval = await storage.updateApproval(householdId, req.params.id, req.body);
      if (!approval) {
        return res.status(404).json({ message: "Approval not found" });
      }
      
      wsManager.broadcast("approval:updated", { id: approval.id, status: approval.status }, householdId, userId);
      
      res.json(approval);
    } catch (error) {
      logger.error("Error updating approval", { error, householdId, userId });
      res.status(500).json({ message: "Failed to update approval" });
    }
  });
  
  app.get("/api/updates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to fetch updates" });
    }
  });
  
  app.post("/api/updates", isAuthenticated, householdContext, requirePermission("CAN_CREATE_UPDATE"), async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to create update" });
    }
  });
  
  app.post("/api/updates/:id/reactions", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { emoji } = req.body;
      
      const update = await storage.getUpdate(householdId, req.params.id);
      if (!update) {
        return res.status(404).json({ message: "Update not found" });
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
      res.status(500).json({ message: "Failed to update reactions" });
    }
  });
  
  app.get("/api/requests", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const requests = await storage.getRequests(householdId);
      res.json(requests);
    } catch (error) {
      logger.error("Error fetching requests", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch requests" });
    }
  });
  
  app.post("/api/requests", isAuthenticated, householdContext, requirePermission("CAN_CREATE_REQUESTS"), async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to create request" });
    }
  });

  app.patch("/api/requests/:id", isAuthenticated, householdContext, requirePermission("CAN_UPDATE_REQUEST"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;
      const updated = await storage.updateRequest(householdId, req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Request not found" });
      }
      wsManager.broadcast("request:updated", { id: updated.id }, householdId, userId);
      res.json(updated);
    } catch (error) {
      logger.error("Error updating request", { error, householdId, userId });
      res.status(500).json({ message: "Failed to update request" });
    }
  });
  
  app.post("/api/comments", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      
      const comment = await storage.createComment({
        ...req.body,
        userId,
      });
      
      res.status(201).json(comment);
    } catch (error) {
      logger.error("Error creating comment", { error, userId });
      res.status(500).json({ message: "Failed to create comment" });
    }
  });
  
  app.get("/api/vendors", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const vendors = await storage.getVendors(householdId);
      res.json(vendors);
    } catch (error) {
      logger.error("Error fetching vendors", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });
  
  app.post("/api/vendors", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const vendor = await storage.createVendor({
        ...req.body,
        householdId,
      });
      
      res.status(201).json(vendor);
    } catch (error) {
      logger.error("Error creating vendor", { error, householdId, userId });
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  // Reactions API
  app.get("/api/reactions", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to fetch reactions" });
    }
  });
  
  app.post("/api/reactions", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
        return res.status(400).json({ message: "Invalid request body", errors: parseResult.error.errors });
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
        return res.status(404).json({ message: "Entity not found" });
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
      res.status(500).json({ message: "Failed to save reaction" });
    }
  });
}
