import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { expensiveLimiter } from "../lib/rate-limit";
import { householdContextMiddleware } from "../middleware/householdContext";
import * as googleCalendar from "../services/google-calendar";
import { google } from "googleapis";

const householdContext = householdContextMiddleware;

export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/google/auth", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.headers["x-household-id"];
      if (!householdId) {
        return res.status(400).json({ error: "No household context" });
      }
      const crypto = await import("crypto");
      const nonce = crypto.randomBytes(16).toString("hex");
      (req.session as any).oauthState = { nonce, userId, householdId, createdAt: Date.now() };
      const state = Buffer.from(JSON.stringify({ nonce, userId, householdId })).toString("base64url");
      const authUrl = googleCalendar.getAuthUrl(state);
      res.json({ authUrl });
    } catch (error) {
      logger.error("Error generating auth URL", { error, userId });
      res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.redirect("/?error=missing_params");
      }
      const parsedState = JSON.parse(Buffer.from(state as string, "base64url").toString());
      const { nonce, userId, householdId } = parsedState;
      const sessionState = (req.session as any).oauthState;
      if (!sessionState || sessionState.nonce !== nonce || sessionState.userId !== userId || sessionState.householdId !== householdId) {
        return res.redirect("/?error=invalid_state");
      }
      if (Date.now() - sessionState.createdAt > 10 * 60 * 1000) {
        return res.redirect("/?error=expired_state");
      }
      delete (req.session as any).oauthState;
      const tokens = await googleCalendar.exchangeCodeForTokens(code as string);
      const oauth2Client = googleCalendar.getOAuthClient();
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      await googleCalendar.saveConnection(householdId, userId, tokens, userInfo.data.email || undefined);
      res.redirect("/settings?tab=calendar&connected=true");
    } catch (error) {
      logger.error("Error in OAuth callback", { error });
      res.redirect("/settings?tab=calendar&error=auth_failed");
    }
  });

  app.get("/api/google/calendars", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const connection = await googleCalendar.getConnection(householdId);
      if (!connection) {
        return res.status(404).json({ error: "No calendar connection" });
      }
      const calendars = await googleCalendar.listCalendars(connection.id);
      const selections = await googleCalendar.getSelectedCalendars(connection.id);
      const selectedIds = selections.map(s => s.calendarId);
      res.json({
        connection: { id: connection.id, email: connection.email },
        calendars: calendars.map(cal => ({
          id: cal.id,
          name: cal.summary,
          color: cal.backgroundColor,
          isSelected: selectedIds.includes(cal.id || ""),
        })),
      });
    } catch (error) {
      logger.error("Error listing calendars", { error, householdId });
      res.status(500).json({ error: "Failed to list calendars" });
    }
  });

  app.post("/api/google/calendars/select", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { calendarIds } = req.body;
      const connection = await googleCalendar.getConnection(householdId);
      if (!connection) {
        return res.status(404).json({ error: "No calendar connection" });
      }
      const calendars = await googleCalendar.listCalendars(connection.id);
      for (const calendarId of calendarIds) {
        const cal = calendars.find(c => c.id === calendarId);
        if (cal) {
          await googleCalendar.saveCalendarSelection(
            connection.id,
            calendarId,
            cal.summary || "Calendar",
            cal.backgroundColor || "#039BE5"
          );
        }
      }
      res.json({ success: true });
    } catch (error) {
      logger.error("Error selecting calendars", { error, householdId });
      res.status(500).json({ error: "Failed to select calendars" });
    }
  });

  app.post("/api/google/sync", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const result = await googleCalendar.syncCalendarEvents(householdId);
      res.json(result);
    } catch (error) {
      logger.error("Error syncing calendar", { error, householdId });
      res.status(500).json({ error: "Failed to sync calendar" });
    }
  });

  app.delete("/api/google/disconnect", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      await googleCalendar.disconnectCalendar(householdId);
      res.status(204).send();
    } catch (error) {
      logger.error("Error disconnecting calendar", { error, householdId });
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });
}
