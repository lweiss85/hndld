import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import * as googleCalendarReplit from "../services/google-calendar-replit";

const householdContext = householdContextMiddleware;

export function registerCalendarRoutes(app: Express) {
  app.get("/api/calendar-events", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
  
  app.post("/api/calendar/sync", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
  
  app.get("/api/calendar/status", isAuthenticated, householdContext, async (_req, res) => {
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
  
  app.post("/api/calendar-events/:id/create-task", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
