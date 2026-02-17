import type { Request, Response, NextFunction } from "express";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { expensiveLimiter } from "../lib/rate-limit";
import { householdContextMiddleware } from "../middleware/householdContext";
import * as googleCalendar from "../services/google-calendar";
import { google } from "googleapis";
import { badRequest, notFound, internalError } from "../lib/errors";

const householdContext = householdContextMiddleware;

export function registerGoogleCalendarRoutes(app: Router) {
  /**
   * @openapi
   * /google/auth:
   *   get:
   *     summary: Initiate Google OAuth flow
   *     description: Generates a Google OAuth authorization URL for connecting a Google Calendar account.
   *     tags:
   *       - Google Calendar
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: OAuth authorization URL
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 authUrl:
   *                   type: string
   *                   format: uri
   *       400:
   *         description: Missing household context
   *       500:
   *         description: Internal server error
   */
  app.get("/google/auth", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.headers["x-household-id"];
      if (!householdId) {
        throw badRequest("No household context");
      }
      const crypto = await import("crypto");
      const nonce = crypto.randomBytes(16).toString("hex");
      (req.session as any).oauthState = { nonce, userId, householdId, createdAt: Date.now() };
      const state = Buffer.from(JSON.stringify({ nonce, userId, householdId })).toString("base64url");
      const authUrl = googleCalendar.getAuthUrl(state);
      res.json({ authUrl });
    } catch (error) {
      logger.error("Error generating auth URL", { error, userId });
      next(internalError("Failed to generate auth URL"));
    }
  });

  /**
   * @openapi
   * /google/callback:
   *   get:
   *     summary: Google OAuth callback
   *     description: Handles the OAuth callback from Google, exchanges the authorization code for tokens, and saves the calendar connection.
   *     tags:
   *       - Google Calendar
   *     parameters:
   *       - in: query
   *         name: code
   *         required: true
   *         schema:
   *           type: string
   *         description: OAuth authorization code
   *       - in: query
   *         name: state
   *         required: true
   *         schema:
   *           type: string
   *         description: Base64url-encoded state parameter
   *     responses:
   *       302:
   *         description: Redirects to settings page on success or home page on error
   */
  app.get("/google/callback", async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /google/calendars:
   *   get:
   *     summary: List Google calendars
   *     description: Lists all available Google calendars for the connected account, including selection status.
   *     tags:
   *       - Google Calendar
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of calendars with connection info
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 connection:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: integer
   *                     email:
   *                       type: string
   *                 calendars:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       name:
   *                         type: string
   *                       color:
   *                         type: string
   *                       isSelected:
   *                         type: boolean
   *       404:
   *         description: No calendar connection found
   *       500:
   *         description: Internal server error
   */
  app.get("/google/calendars", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const connection = await googleCalendar.getConnection(householdId);
      if (!connection) {
        throw notFound("No calendar connection");
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
      next(internalError("Failed to list calendars"));
    }
  });

  /**
   * @openapi
   * /google/calendars/select:
   *   post:
   *     summary: Select calendars to sync
   *     description: Saves the selected Google calendars for syncing events into the household.
   *     tags:
   *       - Google Calendar
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
   *               - calendarIds
   *             properties:
   *               calendarIds:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Calendars selected successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *       404:
   *         description: No calendar connection found
   *       500:
   *         description: Internal server error
   */
  app.post("/google/calendars/select", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { calendarIds } = req.body;
      const connection = await googleCalendar.getConnection(householdId);
      if (!connection) {
        throw notFound("No calendar connection");
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
      next(internalError("Failed to select calendars"));
    }
  });

  /**
   * @openapi
   * /google/sync:
   *   post:
   *     summary: Sync Google Calendar events
   *     description: Triggers a sync of events from selected Google calendars into the household. Rate limited.
   *     tags:
   *       - Google Calendar
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Sync result
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       429:
   *         description: Rate limit exceeded
   *       500:
   *         description: Internal server error
   */
  app.post("/google/sync", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const result = await googleCalendar.syncCalendarEvents(householdId);
      res.json(result);
    } catch (error) {
      logger.error("Error syncing calendar", { error, householdId });
      next(internalError("Failed to sync calendar"));
    }
  });

  /**
   * @openapi
   * /google/disconnect:
   *   delete:
   *     summary: Disconnect Google Calendar
   *     description: Removes the Google Calendar connection and all synced calendar selections for the household.
   *     tags:
   *       - Google Calendar
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       204:
   *         description: Calendar disconnected successfully
   *       500:
   *         description: Internal server error
   */
  app.delete("/google/disconnect", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      await googleCalendar.disconnectCalendar(householdId);
      res.status(204).send();
    } catch (error) {
      logger.error("Error disconnecting calendar", { error, householdId });
      next(internalError("Failed to disconnect"));
    }
  });
}
