// Google Calendar integration using Replit Connector
// This uses the Replit-managed OAuth flow for Google Calendar access
//
// Architecture Note: The Replit connector is project-scoped, meaning all users
// share the same Google Calendar connection. This is intentional for hndld's use case
// where:
// 1. A household assistant sets up the calendar connection
// 2. All household members see events from that shared calendar
// 3. Events from Skylight Calendar are synced to this Google Calendar first
//
// For multi-tenant scenarios with per-user calendars, additional per-user
// OAuth implementation would be needed (see google-calendar.ts for that approach)

import { google } from 'googleapis';
import { storage } from "../storage";
import type { InsertCalendarEvent } from "@shared/schema";

interface ConnectionSettings {
  settings: {
    access_token?: string;
    expires_at?: string;
    oauth?: {
      credentials?: {
        access_token?: string;
      };
    };
  };
}

let connectionSettings: ConnectionSettings | null = null;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then((data: Record<string, unknown>) => ((data.items as ConnectionSettings[]) ?? [])[0] ?? null);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

export async function getUncachableGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export async function isGoogleCalendarConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export async function listCalendars() {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    const response = await calendar.calendarList.list();
    return response.data.items || [];
  } catch (error) {
    console.error("Error listing calendars:", error);
    return [];
  }
}

export async function syncCalendarEventsFromReplit(householdId: string) {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    // Get list of calendars
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items || [];
    
    let totalSynced = 0;
    const syncedProviderIds: string[] = [];
    
    for (const cal of calendars) {
      if (!cal.id) continue;
      
      try {
        const events = await calendar.events.list({
          calendarId: cal.id,
          timeMin: now.toISOString(),
          timeMax: thirtyDaysFromNow.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 100,
        });

        for (const event of events.data.items || []) {
          const startDate = event.start?.dateTime || event.start?.date;
          const endDate = event.end?.dateTime || event.end?.date;
          if (!startDate || !event.id) continue;

          syncedProviderIds.push(event.id);

          // Check if event already exists using storage layer
          const existingEvent = await storage.getCalendarEventByProviderId(householdId, event.id);

          const eventData: Partial<InsertCalendarEvent> = {
            title: event.summary || "Untitled Event",
            description: event.description || null,
            startAt: new Date(startDate),
            endAt: endDate ? new Date(endDate) : null,
            location: event.location || null,
            calendarId: cal.id,
          };

          if (!existingEvent) {
            // Create new event via storage layer
            await storage.createCalendarEvent({
              ...eventData,
              householdId,
              providerEventId: event.id,
              title: eventData.title || "Untitled Event",
              startAt: eventData.startAt!,
            } as InsertCalendarEvent);
            totalSynced++;
          } else {
            // Update existing event via storage layer
            await storage.updateCalendarEvent(householdId, existingEvent.id, eventData);
          }
        }
      } catch (calError) {
        console.error(`Error syncing calendar ${cal.id}:`, calError);
      }
    }

    // Clean up events that no longer exist in Google Calendar
    const deletedCount = await storage.deleteCalendarEventsNotIn(householdId, syncedProviderIds);
    if (deletedCount > 0) {
      console.log(`Deleted ${deletedCount} stale calendar events for household ${householdId}`);
    }

    return { synced: totalSynced, deleted: deletedCount, success: true };
  } catch (error) {
    console.error("Error syncing calendar events:", error);
    return { synced: 0, deleted: 0, success: false, error: (error as Error).message };
  }
}
