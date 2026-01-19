import { google, calendar_v3 } from "googleapis";
import { db } from "../db";
import { calendarConnections, calendarSelections, calendarEvents } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000"}/api/google/callback`;
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state: string): string {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function saveConnection(
  householdId: string,
  userId: string,
  tokens: any,
  email?: string
) {
  const accessTokenEncrypted = encrypt(tokens.access_token);
  const refreshTokenEncrypted = encrypt(tokens.refresh_token || "");
  const tokenExpiry = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

  const existing = await db
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.householdId, householdId),
        eq(calendarConnections.userId, userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(calendarConnections)
      .set({
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiry,
        email,
        updatedAt: new Date(),
      })
      .where(eq(calendarConnections.id, existing[0].id));
    return existing[0].id;
  }

  const [result] = await db
    .insert(calendarConnections)
    .values({
      householdId,
      userId,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiry,
      email,
    })
    .returning();

  return result.id;
}

export async function getConnection(householdId: string) {
  const connections = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.householdId, householdId))
    .limit(1);

  return connections[0] || null;
}

export async function getCalendarClient(connectionId: string): Promise<calendar_v3.Calendar | null> {
  const connections = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.id, connectionId))
    .limit(1);

  if (!connections[0]) return null;

  const connection = connections[0];
  const oauth2Client = getOAuthClient();

  let accessToken = decrypt(connection.accessTokenEncrypted);
  const refreshToken = connection.refreshTokenEncrypted ? decrypt(connection.refreshTokenEncrypted) : "";

  if (new Date(connection.tokenExpiry) < new Date()) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    accessToken = credentials.access_token || accessToken;

    await db
      .update(calendarConnections)
      .set({
        accessTokenEncrypted: encrypt(accessToken),
        tokenExpiry: new Date(credentials.expiry_date || Date.now() + 3600 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(calendarConnections.id, connectionId));
  }

  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function listCalendars(connectionId: string) {
  const calendar = await getCalendarClient(connectionId);
  if (!calendar) return [];

  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

export async function saveCalendarSelection(connectionId: string, calendarId: string, calendarName: string, color: string) {
  const existing = await db
    .select()
    .from(calendarSelections)
    .where(
      and(
        eq(calendarSelections.connectionId, connectionId),
        eq(calendarSelections.calendarId, calendarId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(calendarSelections)
      .set({ isEnabled: true, calendarName, color })
      .where(eq(calendarSelections.id, existing[0].id));
    return existing[0].id;
  }

  const [result] = await db
    .insert(calendarSelections)
    .values({ connectionId, calendarId, calendarName, color })
    .returning();

  return result.id;
}

export async function getSelectedCalendars(connectionId: string) {
  return db
    .select()
    .from(calendarSelections)
    .where(
      and(
        eq(calendarSelections.connectionId, connectionId),
        eq(calendarSelections.isEnabled, true)
      )
    );
}

export async function syncCalendarEvents(householdId: string) {
  const connection = await getConnection(householdId);
  if (!connection) return { synced: 0, error: "No calendar connection" };

  const calendar = await getCalendarClient(connection.id);
  if (!calendar) return { synced: 0, error: "Failed to get calendar client" };

  const selections = await getSelectedCalendars(connection.id);
  if (selections.length === 0) return { synced: 0, error: "No calendars selected" };

  let totalSynced = 0;
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const selection of selections) {
    try {
      const events = await calendar.events.list({
        calendarId: selection.calendarId,
        timeMin: now.toISOString(),
        timeMax: thirtyDaysFromNow.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100,
      });

      for (const event of events.data.items || []) {
        const startDate = event.start?.dateTime || event.start?.date;
        const endDate = event.end?.dateTime || event.end?.date;
        if (!startDate) continue;

        const existingEvents = await db
          .select()
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.householdId, householdId),
              eq(calendarEvents.providerEventId, event.id || "")
            )
          )
          .limit(1);

        if (existingEvents.length === 0) {
          await db.insert(calendarEvents).values({
            householdId,
            title: event.summary || "Untitled Event",
            description: event.description || null,
            startAt: new Date(startDate),
            endAt: endDate ? new Date(endDate) : new Date(startDate),
            location: event.location || null,
            providerEventId: event.id || null,
          });
          totalSynced++;
        } else {
          await db
            .update(calendarEvents)
            .set({
              title: event.summary || "Untitled Event",
              description: event.description || null,
              startAt: new Date(startDate),
              endAt: endDate ? new Date(endDate) : new Date(startDate),
              location: event.location || null,
              updatedAt: new Date(),
            })
            .where(eq(calendarEvents.id, existingEvents[0].id));
        }
      }

      await db
        .update(calendarSelections)
        .set({ lastSynced: new Date() })
        .where(eq(calendarSelections.id, selection.id));
    } catch (error) {
      console.error(`Error syncing calendar ${selection.calendarId}:`, error);
    }
  }

  return { synced: totalSynced };
}

export async function disconnectCalendar(householdId: string) {
  const connection = await getConnection(householdId);
  if (!connection) return false;

  await db.delete(calendarConnections).where(eq(calendarConnections.id, connection.id));
  return true;
}
