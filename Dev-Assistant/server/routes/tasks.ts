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
import { cache, CacheKeys, CacheTTL } from "../lib/cache";

const householdContext = householdContextMiddleware;

export function registerTaskRoutes(app: Router) {
  /**
   * @openapi
   * /tasks:
   *   get:
   *     tags: [Tasks]
   *     summary: List tasks
   *     description: Retrieve tasks for the current household. Staff users only see their own assigned cleaning tasks. Supports optional pagination via page/limit query params.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: serviceType
   *         schema:
   *           type: string
   *           enum: [CLEANING, PA]
   *         description: Filter tasks by service type
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination (requires limit)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of tasks per page. 0 returns all tasks without pagination.
   *     responses:
   *       200:
   *         description: Array of tasks or paginated result
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - type: array
   *                   items:
   *                     $ref: '#/components/schemas/Task'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Task'
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
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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
  
  /**
   * @openapi
   * /tasks:
   *   post:
   *     tags: [Tasks]
   *     summary: Create task
   *     description: Create a new task in the current household. If no estimatedMinutes is provided, an AI estimate is attempted based on the title and category.
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
   *             required:
   *               - title
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               category:
   *                 type: string
   *               urgency:
   *                 type: string
   *               location:
   *                 type: string
   *               notes:
   *                 type: string
   *               dueAt:
   *                 type: string
   *                 format: date-time
   *               estimatedMinutes:
   *                 type: integer
   *               serviceType:
   *                 type: string
   *                 enum: [CLEANING, PA]
   *               recurrence:
   *                 type: string
   *               assignedTo:
   *                 type: string
   *     responses:
   *       201:
   *         description: Task created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Task'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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
  
  /**
   * @openapi
   * /tasks/{id}:
   *   patch:
   *     tags: [Tasks]
   *     summary: Update task
   *     description: Update an existing task by ID. Staff users can only update tasks assigned to them within the CLEANING service type.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Task ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               category:
   *                 type: string
   *               urgency:
   *                 type: string
   *               status:
   *                 type: string
   *               location:
   *                 type: string
   *               notes:
   *                 type: string
   *               dueAt:
   *                 type: string
   *                 format: date-time
   *                 nullable: true
   *               estimatedMinutes:
   *                 type: integer
   *               assignedTo:
   *                 type: string
   *     responses:
   *       200:
   *         description: Task updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Task'
   *       403:
   *         description: Forbidden – staff cannot modify this task
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Task not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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
  
  /**
   * @openapi
   * /tasks/{id}:
   *   delete:
   *     tags: [Tasks]
   *     summary: Delete task
   *     description: Delete a task by ID. Staff users are not allowed to delete tasks.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Task ID
   *     responses:
   *       204:
   *         description: Task deleted successfully
   *       403:
   *         description: Forbidden – staff cannot delete tasks
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Task not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

  /**
   * @openapi
   * /tasks/{id}/complete:
   *   post:
   *     tags: [Tasks]
   *     summary: Complete task
   *     description: Mark a task as done. If the task is recurring, a new task is automatically created for the next occurrence.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Task ID
   *     responses:
   *       200:
   *         description: Task completed, with optional next recurring task
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 completedTask:
   *                   $ref: '#/components/schemas/Task'
   *                 nextTask:
   *                   $ref: '#/components/schemas/Task'
   *                 nextDue:
   *                   type: string
   *                   description: Formatted next due date (e.g. "Feb 20")
   *       403:
   *         description: Forbidden – staff cannot complete this task
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Task not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

  /**
   * @openapi
   * /tasks/{id}/cancel:
   *   post:
   *     tags: [Tasks]
   *     summary: Cancel task
   *     description: Cancel a task by ID. Notifies household assistants of the cancellation. Cannot cancel tasks already done or cancelled.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Task ID
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               reason:
   *                 type: string
   *                 description: Optional cancellation reason
   *     responses:
   *       200:
   *         description: Task cancelled successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 task:
   *                   $ref: '#/components/schemas/Task'
   *                 message:
   *                   type: string
   *                 notifiedAssistants:
   *                   type: integer
   *                   description: Number of assistants notified
   *       400:
   *         description: Task is already done or cancelled
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Forbidden – staff cannot cancel this task
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Task not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

  /**
   * @openapi
   * /tasks/{taskId}/checklist:
   *   post:
   *     tags: [Tasks]
   *     summary: Add checklist item
   *     description: Add a new checklist item to a task.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: taskId
   *         required: true
   *         schema:
   *           type: string
   *         description: Task ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - text
   *             properties:
   *               text:
   *                 type: string
   *                 description: Checklist item text
   *     responses:
   *       201:
   *         description: Checklist item created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/TaskChecklistItem'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

  /**
   * @openapi
   * /tasks/{taskId}/checklist/{id}:
   *   patch:
   *     tags: [Tasks]
   *     summary: Update checklist item
   *     description: Update a checklist item on a task (e.g. mark as done, change text).
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: taskId
   *         required: true
   *         schema:
   *           type: string
   *         description: Task ID
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Checklist item ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text:
   *                 type: string
   *               done:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Checklist item updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/TaskChecklistItem'
   *       404:
   *         description: Checklist item not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

  /**
   * @openapi
   * /task-templates:
   *   get:
   *     tags: [Task Templates]
   *     summary: List task templates
   *     description: Retrieve all task templates for the current household.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Array of task templates
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/TaskTemplate'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  app.get("/task-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const templates = await cache.getOrSet(
        CacheKeys.taskTemplates(householdId),
        () => storage.getTaskTemplates(householdId),
        CacheTTL.LONG
      );
      res.json(templates);
    } catch (error) {
      logger.error("Error fetching task templates", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch task templates" });
    }
  });

  /**
   * @openapi
   * /task-templates:
   *   post:
   *     tags: [Task Templates]
   *     summary: Create task template
   *     description: Create a new task template for the current household.
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
   *             required:
   *               - title
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               category:
   *                 type: string
   *               urgency:
   *                 type: string
   *               estimatedMinutes:
   *                 type: integer
   *               recurrence:
   *                 type: string
   *               checklist:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     text:
   *                       type: string
   *     responses:
   *       201:
   *         description: Task template created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/TaskTemplate'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  app.post("/task-templates", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const template = await storage.createTaskTemplate({
        ...req.body,
        householdId,
      });
      cache.invalidate(CacheKeys.taskTemplates(householdId));
      res.status(201).json(template);
    } catch (error) {
      logger.error("Error creating task template", { error, householdId });
      res.status(500).json({ message: "Failed to create task template" });
    }
  });

  /**
   * @openapi
   * /task-templates/{id}:
   *   patch:
   *     tags: [Task Templates]
   *     summary: Update task template
   *     description: Update an existing task template by ID.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Task template ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               category:
   *                 type: string
   *               urgency:
   *                 type: string
   *               estimatedMinutes:
   *                 type: integer
   *               recurrence:
   *                 type: string
   *     responses:
   *       200:
   *         description: Task template updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/TaskTemplate'
   *       404:
   *         description: Template not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  app.patch("/task-templates/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const template = await storage.updateTaskTemplate(householdId, req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      cache.invalidate(CacheKeys.taskTemplates(householdId));
      res.json(template);
    } catch (error) {
      logger.error("Error updating task template", { error, householdId });
      res.status(500).json({ message: "Failed to update task template" });
    }
  });

  /**
   * @openapi
   * /task-templates/{id}:
   *   delete:
   *     tags: [Task Templates]
   *     summary: Delete task template
   *     description: Delete a task template by ID.
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Task template ID
   *     responses:
   *       204:
   *         description: Task template deleted successfully
   *       404:
   *         description: Template not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  app.delete("/task-templates/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const deleted = await storage.deleteTaskTemplate(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      cache.invalidate(CacheKeys.taskTemplates(householdId));
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting task template", { error, householdId });
      res.status(500).json({ message: "Failed to delete task template" });
    }
  });
}
