import type { Request, Response } from "express";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import * as googleCalendarReplit from "../services/google-calendar-replit";

const householdContext = householdContextMiddleware;

export function registerCalendarRoutes(app: Router) {
  /**
   * @openapi
   * /calendar-events:
   *   get:
   *     tags:
   *       - Calendar
   *     summary: List calendar events for household
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Household ID
   *     responses:
   *       200:
   *         description: List of calendar events
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/CalendarEvent'
   *       500:
   *         description: Failed to fetch calendar events
   */
  app.get("/calendar-events", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const events = await storage.getCalendarEvents(householdId);
      res.json(events);
    } catch (error) {
      logger.error("Error fetching calendar events", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch calendar events" });
    }
  });
  
  /**
   * @openapi
   * /calendar/sync:
   *   post:
   *     tags:
   *       - Calendar
   *     summary: Sync calendar with Google Calendar
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Household ID
   *     responses:
   *       200:
   *         description: Sync result
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 synced:
   *                   type: integer
   *                 success:
   *                   type: boolean
   *                 source:
   *                   type: string
   *       500:
   *         description: Failed to sync calendar
   */
  app.post("/calendar/sync", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      // Check if Replit Google Calendar connector is available
      const isConnected = await googleCalendarReplit.isGoogleCalendarConnected();
      
      if (isConnected) {
        const result = await googleCalendarReplit.syncCalendarEventsFromReplit(householdId);
        res.json({ 
          message: result.success ? `Synced ${result.synced} events from Google Calendar` : "Sync failed",
          synced: result.synced,
          success: result.success,
          source: "google_calendar"
        });
      } else {
        res.json({ message: "Google Calendar not connected. Connect your calendar to sync events.", success: false });
      }
    } catch (error) {
      logger.error("Error syncing calendar", { error, userId, householdId });
      res.status(500).json({ message: "Failed to sync calendar" });
    }
  });
  
  /**
   * @openapi
   * /calendar/status:
   *   get:
   *     tags:
   *       - Calendar
   *     summary: Check Google Calendar connection status
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Household ID
   *     responses:
   *       200:
   *         description: Calendar connection status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 connected:
   *                   type: boolean
   *                 provider:
   *                   type: string
   */
  app.get("/calendar/status", isAuthenticated, householdContext, async (_req, res) => {
    try {
      const isConnected = await googleCalendarReplit.isGoogleCalendarConnected();
      res.json({ 
        connected: isConnected,
        provider: "google_calendar"
      });
    } catch (error) {
      res.json({ connected: false, provider: "google_calendar" });
    }
  });
  
  /**
   * @openapi
   * /calendar-events/{id}/create-task:
   *   post:
   *     tags:
   *       - Calendar
   *     summary: Create task from calendar event
   *     security:
   *       - session: []
   *     parameters:
   *       - in: header
   *         name: x-household-id
   *         required: true
   *         schema:
   *           type: string
   *         description: Household ID
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Calendar event ID
   *     responses:
   *       201:
   *         description: Task created from calendar event
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Task'
   *       404:
   *         description: Event not found
   *       500:
   *         description: Failed to create task from event
   */
  app.post("/calendar-events/:id/create-task", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const event = await storage.getCalendarEvent(householdId, req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const task = await storage.createTask({
        title: event.title,
        description: event.description || undefined,
        location: event.location || undefined,
        dueAt: event.startAt,
        category: "EVENTS",
        urgency: "MEDIUM",
        status: "PLANNED",
        createdBy: userId,
        householdId,
      });
      
      res.status(201).json(task);
    } catch (error) {
      logger.error("Error creating task from event", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create task from event" });
    }
  });
}
