import type { Request, Response } from "express";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { wsManager } from "../services/websocket";
import { estimateTaskMinutes } from "../services/ai-provider";
import { notify } from "../services/notifications";
import { calculateNextOccurrence } from "./helpers";
import { z } from "zod";
import { format } from "date-fns";

const householdContext = householdContextMiddleware;

export function registerTaskRoutes(app: Router) {
  app.get("/tasks", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      const serviceType = req.query.serviceType as string | undefined;
      
      let tasks = await storage.getTasks(householdId);
      
      if (userRole === "STAFF") {
        tasks = tasks.filter(t => t.assignedTo === userId);
        // STAFF can only access CLEANING service
        tasks = tasks.filter(t => t.serviceType === "CLEANING");
      } else if (serviceType && ["CLEANING", "PA"].includes(serviceType)) {
        // Filter by requested service type
        tasks = tasks.filter(t => t.serviceType === serviceType);
      }
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 0;
      
      if (limit > 0) {
        const start = (page - 1) * limit;
        const paginated = tasks.slice(start, start + limit);
        res.json({
          data: paginated,
          pagination: {
            page,
            limit,
            total: tasks.length,
            totalPages: Math.ceil(tasks.length / limit),
          },
        });
      } else {
        res.json(tasks);
      }
    } catch (error) {
      logger.error("Error fetching tasks", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });
  
  app.post("/tasks", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      let estimatedMinutes = req.body.estimatedMinutes;
      
      if (!estimatedMinutes && req.body.title) {
        try {
          const estimate = await estimateTaskMinutes(
            req.body.title,
            req.body.category,
            req.body.description
          );
          if (estimate && estimate.estimatedMinutes > 0) {
            estimatedMinutes = estimate.estimatedMinutes;
          }
        } catch (err) {
          logger.info("AI estimate failed, using category default");
        }
      }
      
      const taskData = {
        ...req.body,
        createdBy: userId,
        householdId,
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null,
        estimatedMinutes: estimatedMinutes || null,
      };
      
      const task = await storage.createTask(taskData);
      
      wsManager.broadcast("task:created", { id: task.id, title: task.title }, householdId, userId);
      
      res.status(201).json(task);
    } catch (error) {
      logger.error("Error creating task", { error, householdId, userId });
      res.status(500).json({ message: "Failed to create task" });
    }
  });
  
  app.patch("/tasks/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      if (userRole === "STAFF") {
        const allTasks = await storage.getTasks(householdId);
        const existingTask = allTasks.find(t => t.id === req.params.id);
        if (!existingTask || existingTask.assignedTo !== userId) {
          return res.status(403).json({ message: "You can only update tasks assigned to you" });
        }
        if (existingTask.serviceType !== "CLEANING") {
          return res.status(403).json({ message: "Staff can only modify cleaning tasks" });
        }
      }
      
      const updateData = {
        ...req.body,
        ...(req.body.dueAt !== undefined && { dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null }),
      };
      
      const task = await storage.updateTask(householdId, req.params.id, updateData);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      wsManager.broadcast("task:updated", { id: task.id, title: task.title }, householdId, userId);
      
      res.json(task);
    } catch (error) {
      logger.error("Error updating task", { error, householdId, userId });
      res.status(500).json({ message: "Failed to update task" });
    }
  });
  
  app.delete("/tasks/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      if (userRole === "STAFF") {
        return res.status(403).json({ message: "Staff cannot delete tasks" });
      }
      
      const deleted = await storage.deleteTask(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      wsManager.broadcast("task:deleted", { id: req.params.id }, householdId, userId);
      
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting task", { error, householdId, userId });
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Task completion endpoint with recurrence handling
  app.post("/tasks/:id/complete", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      const taskId = req.params.id;
      
      // Get the current task
      const allTasks = await storage.getTasks(householdId);
      const task = allTasks.find(t => t.id === taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (userRole === "STAFF") {
        if (task.assignedTo !== userId) {
          return res.status(403).json({ message: "You can only complete tasks assigned to you" });
        }
        if (task.serviceType !== "CLEANING") {
          return res.status(403).json({ message: "Staff can only complete cleaning tasks" });
        }
      }
      
      // Mark current task as done
      await storage.updateTask(householdId, taskId, { status: "DONE" });
      
      // If this is a recurring task, create the next occurrence
      if (task.recurrence && task.recurrence !== "none") {
        const nextDue = calculateNextOccurrence(task.recurrence, task.recurrenceCustomDays, task.dueAt);
        
        if (nextDue) {
          // Generate or use existing group ID
          const groupId = task.recurrenceGroupId || taskId;
          const nextOccurrence = (task.recurrenceOccurrence || 1) + 1;
          
          // Create next task in the series
          const nextTask = await storage.createTask({
            title: task.title,
            description: task.description,
            category: task.category,
            urgency: task.urgency,
            location: task.location,
            notes: task.notes,
            recurrence: task.recurrence,
            recurrenceCustomDays: task.recurrenceCustomDays,
            recurrenceGroupId: groupId,
            recurrenceOccurrence: nextOccurrence,
            dueAt: nextDue,
            status: "PLANNED",
            createdBy: userId,
            householdId,
          });
          
          // If original task didn't have a group ID, update it
          if (!task.recurrenceGroupId) {
            await storage.updateTask(householdId, taskId, { recurrenceGroupId: groupId });
          }
          
          return res.json({ 
            completedTask: { ...task, status: "DONE" },
            nextTask,
            nextDue: format(nextDue, "MMM d")
          });
        }
      }
      
      res.json({ completedTask: { ...task, status: "DONE" } });
    } catch (error) {
      logger.error("Error completing task", { error, householdId, userId, taskId });
      res.status(500).json({ message: "Failed to complete task" });
    }
  });

  // Task cancellation endpoint
  app.post("/tasks/:id/cancel", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      const taskId = req.params.id;
      
      const cancelSchema = z.object({
        reason: z.string().optional(),
      });
      
      const parseResult = cancelSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { reason } = parseResult.data;
      
      const task = await storage.getTask(householdId, taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (userRole === "STAFF") {
        if (task.assignedTo !== userId) {
          return res.status(403).json({ message: "You can only cancel tasks assigned to you" });
        }
        if (task.serviceType !== "CLEANING") {
          return res.status(403).json({ message: "Staff can only cancel cleaning tasks" });
        }
      }
      
      if (task.status === "DONE" || task.status === "CANCELLED") {
        return res.status(400).json({ message: "Cannot cancel a task that is already done or cancelled" });
      }
      
      const updatedTask = await storage.updateTask(householdId, taskId, {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: reason || null,
      });
      
      const user = await storage.getUser(userId);
      const cancelledByName = user?.firstName || "Someone";
      
      const assistantProfiles = await storage.getHouseholdAssistants(householdId);
      const assistantUserIds = assistantProfiles
        .filter(p => p.userId !== userId)
        .map(p => p.userId);
      
      const { notifyTaskCancelled } = await import("../services/notifications");
      const notifiedCount = await notifyTaskCancelled(
        householdId,
        assistantUserIds,
        task.title,
        taskId,
        cancelledByName,
        reason,
        async (uid: string) => {
          const u = await storage.getUser(uid);
          return u?.email || undefined;
        }
      );
      
      const { logAudit } = await import("../services/audit");
      await logAudit({
        householdId,
        userId,
        action: "TASK_CANCELLED",
        entityType: "TASK",
        entityId: taskId,
        after: { taskTitle: task.title, reason },
      });
      
      res.json({ 
        task: updatedTask, 
        message: "Task cancelled successfully",
        notifiedAssistants: notifiedCount 
      });
    } catch (error) {
      logger.error("Error cancelling task", { error, householdId, userId, taskId });
      res.status(500).json({ message: "Failed to cancel task" });
    }
  });

  // Checklist routes
  app.post("/tasks/:taskId/checklist", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const item = await storage.createTaskChecklistItem({
        taskId: req.params.taskId,
        text: req.body.text,
        done: false,
      });
      res.status(201).json(item);
    } catch (error) {
      logger.error("Error creating checklist item", { error, taskId: req.params.taskId });
      res.status(500).json({ message: "Failed to create checklist item" });
    }
  });

  app.patch("/tasks/:taskId/checklist/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { taskId, id } = req.params;
      const item = await storage.updateTaskChecklistItem(householdId, taskId, id, req.body);
      if (!item) {
        return res.status(404).json({ message: "Checklist item not found" });
      }
      res.json(item);
    } catch (error) {
      logger.error("Error updating checklist item", { error, householdId, taskId, id });
      res.status(500).json({ message: "Failed to update checklist item" });
    }
  });

  // Task Templates routes
  app.get("/task-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const templates = await storage.getTaskTemplates(householdId);
      res.json(templates);
    } catch (error) {
      logger.error("Error fetching task templates", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch task templates" });
    }
  });

  app.post("/task-templates", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const template = await storage.createTaskTemplate({
        ...req.body,
        householdId,
      });
      res.status(201).json(template);
    } catch (error) {
      logger.error("Error creating task template", { error, householdId });
      res.status(500).json({ message: "Failed to create task template" });
    }
  });

  app.patch("/task-templates/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const template = await storage.updateTaskTemplate(householdId, req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      logger.error("Error updating task template", { error, householdId });
      res.status(500).json({ message: "Failed to update task template" });
    }
  });

  app.delete("/task-templates/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const deleted = await storage.deleteTaskTemplate(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting task template", { error, householdId });
      res.status(500).json({ message: "Failed to delete task template" });
    }
  });
}
