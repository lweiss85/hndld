import type { Express, Request, Response, NextFunction } from "express";

import express from "express";
import { createServer, type Server } from "http";
import { createReadStream, existsSync } from "fs";
import { join, basename } from "path";
import { storage } from "./storage";
import { getStorageProvider } from "./services/storage-provider";
import { escapeHtml } from "./lib/escape-html";
import { encryptVaultValue, decryptVaultValue } from "./services/vault-encryption";
import logger from "./lib/logger";
import { serviceScopeMiddleware, getServiceTypeFilter } from "./middleware/serviceScope";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { apiLimiter, authLimiter, expensiveLimiter, criticalLimiter } from "./lib/rate-limit";
import { triggerImmediateSync } from "./services/scheduler";
import { householdContextMiddleware } from "./middleware/householdContext";
import { requirePermission } from "./middleware/requirePermission";
import { 
  insertTaskSchema, insertApprovalSchema, insertUpdateSchema, 
  insertRequestSchema, insertCommentSchema, insertVendorSchema,
  insertSpendingItemSchema, insertCalendarEventSchema, insertReactionSchema,
  insertHouseholdSettingsSchema, insertHouseholdLocationSchema, insertPersonSchema,
  insertPreferenceSchema, insertImportantDateSchema, insertAccessItemSchema,
  insertQuickRequestTemplateSchema, insertPlaybookSchema, insertPlaybookStepSchema,
  insertOrganizationSchema, insertHouseholdSchema,
  emergencyContacts, emergencyProtocols, conversations, messages
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { userProfiles, files, fileLinks, spendingItems, households } from "@shared/schema";
import householdRoutes from "./routes/households";
import inviteRoutes from "./routes/invites";
import fileRoutes from "./routes/files";
import weeklyBriefRoutes from "./routes/weekly-brief";
import * as googleCalendar from "./services/google-calendar";
import * as googleCalendarReplit from "./services/google-calendar-replit";
import { google } from "googleapis";
import { addDays, addWeeks, addMonths, startOfWeek, endOfWeek, setHours, setMinutes, format, getMonth, getDate, subDays, isBefore, isAfter, setYear } from "date-fns";

// Helper function to calculate the next occurrence date for recurring tasks
function calculateNextOccurrence(
  recurrence: string,
  customDays: number | null | undefined,
  currentDueAt: Date | null | undefined
): Date | null {
  // Use current due date as anchor, or use now if no due date
  const anchor = currentDueAt ? new Date(currentDueAt) : new Date();
  
  switch (recurrence) {
    case "daily":
      return addDays(anchor, 1);
    case "weekly":
      return addWeeks(anchor, 1);
    case "biweekly":
      return addWeeks(anchor, 2);
    case "monthly":
      return addMonths(anchor, 1);
    case "custom":
      if (customDays && customDays > 0) {
        return addDays(anchor, customDays);
      }
      return null;
    default:
      return null;
  }
}
import { 
  createBackupZip, listBackups, deleteBackup, getBackupPath, 
  getBackupSettings, saveBackupSettings, exportAllData 
} from "./services/backup";
import { startScheduledBackups, restartScheduledBackups } from "./services/scheduler";
import { 
  getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead,
  getNotificationSettings, upsertNotificationSettings, notify
} from "./services/notifications";
import { getImpactMetrics } from "./services/analytics";
import { estimateTaskMinutes } from "./services/ai-provider";
import { getSmartSuggestions } from "./services/ai-suggestions";
import { getVapidPublicKey, isPushEnabled, savePushSubscription, removePushSubscription, getUserSubscriptions } from "./services/push-notifications";
import { wsManager } from "./services/websocket";

async function getOrCreateHousehold(userId: string): Promise<string> {
  let householdId = await storage.getHouseholdByUserId(userId);
  
  if (!householdId) {
    const household = await storage.createHousehold({ name: "My Household" });
    householdId = household.id;
    
    await storage.createUserProfile({
      userId,
      householdId,
      role: "CLIENT",
    });
    
    try {
      await seedDemoData(householdId, userId);
      logger.info("Demo data seeded successfully", { householdId });
    } catch (error) {
      logger.error("Error seeding demo data", { error, householdId });
    }
  }
  
  return householdId;
}

const householdContext = householdContextMiddleware;

async function seedDemoData(householdId: string, userId: string) {
  const now = new Date();
  const createdTaskIds: string[] = [];
  const createdUpdateIds: string[] = [];
  
  const demoTasks = [
    { title: "Pick up dry cleaning", category: "ERRANDS", urgency: "MEDIUM", status: "PLANNED", dueAt: setHours(setMinutes(addDays(now, 0), 30), 14) },
    { title: "Schedule HVAC maintenance", category: "MAINTENANCE", urgency: "LOW", status: "INBOX", dueAt: null },
    { title: "Grocery shopping", category: "GROCERIES", urgency: "HIGH", status: "IN_PROGRESS", dueAt: setHours(setMinutes(addDays(now, 1), 0), 10) },
    { title: "Kids doctor appointment", category: "KIDS", urgency: "HIGH", status: "PLANNED", dueAt: setHours(setMinutes(addDays(now, 2), 0), 15) },
    { title: "Water plants", category: "HOUSEHOLD", urgency: "LOW", status: "DONE", dueAt: null },
  ];
  
  for (const task of demoTasks) {
    const created = await storage.createTask({
      title: task.title,
      category: task.category as any,
      urgency: task.urgency as any,
      status: task.status as any,
      dueAt: task.dueAt,
      createdBy: userId,
      householdId,
    });
    createdTaskIds.push(created.id);
  }
  
  const demoApprovals = [
    { title: "New dishwasher purchase", details: "The current one is leaking. Found a good deal on a Bosch model.", amount: 89900, status: "PENDING" },
    { title: "Pool cleaning service", details: "Monthly pool maintenance for the summer", amount: 15000, status: "APPROVED" },
    { title: "Landscaping quote", details: "Fall cleanup and leaf removal", amount: 45000, status: "PENDING" },
  ];
  
  for (const approval of demoApprovals) {
    await storage.createApproval({
      title: approval.title,
      details: approval.details,
      amount: approval.amount,
      status: approval.status as any,
      createdBy: userId,
      householdId,
    });
  }
  
  const demoUpdates = [
    { text: "Completed the grocery run. All items on the list were in stock. Receipt attached." },
    { text: "Called the plumber about the leaky faucet. They can come Thursday between 2-4pm." },
    { text: "Kids' school supplies have been ordered. Expected delivery is Wednesday." },
  ];
  
  for (const update of demoUpdates) {
    const created = await storage.createUpdate({
      text: update.text,
      createdBy: userId,
      householdId,
    });
    createdUpdateIds.push(created.id);
  }
  
  const demoVendors = [
    { name: "ABC Plumbing", phone: "(555) 123-4567", email: "info@abcplumbing.com", category: "Plumber" },
    { name: "Green Lawn Care", phone: "(555) 234-5678", category: "Landscaping" },
    { name: "Cool Air HVAC", phone: "(555) 345-6789", email: "service@coolair.com", category: "HVAC" },
  ];
  
  for (const vendor of demoVendors) {
    await storage.createVendor({
      name: vendor.name,
      phone: vendor.phone,
      email: vendor.email,
      category: vendor.category,
      householdId,
    });
  }
  
  const demoSpending = [
    { amount: 15623, category: "Groceries", vendor: "Whole Foods", date: addDays(now, -1) },
    { amount: 8500, category: "Household", vendor: "Target", date: addDays(now, -2) },
    { amount: 4500, category: "Utilities", vendor: "Electric Company", date: addDays(now, -3) },
    { amount: 12000, category: "Kids", vendor: "Amazon", note: "School supplies", date: addDays(now, -4) },
  ];
  
  for (const item of demoSpending) {
    await storage.createSpendingItem({
      amount: item.amount,
      category: item.category,
      vendor: item.vendor,
      note: item.note,
      date: item.date,
      createdBy: userId,
      householdId,
    });
  }
  
  const demoEvents = [
    { title: "Kids soccer practice", startAt: setHours(setMinutes(addDays(now, 0), 0), 16), endAt: setHours(setMinutes(addDays(now, 0), 30), 17), location: "City Park" },
    { title: "Piano lesson", startAt: setHours(setMinutes(addDays(now, 1), 0), 15), endAt: setHours(setMinutes(addDays(now, 1), 0), 16), location: "Music Academy" },
    { title: "Parent-teacher conference", startAt: setHours(setMinutes(addDays(now, 2), 30), 9), endAt: setHours(setMinutes(addDays(now, 2), 0), 10), location: "Lincoln Elementary" },
    { title: "Dentist appointment", startAt: setHours(setMinutes(addDays(now, 3), 0), 11), endAt: setHours(setMinutes(addDays(now, 3), 30), 11), location: "Dr. Smith's Office" },
    { title: "Birthday party", startAt: setHours(setMinutes(addDays(now, 4), 0), 14), endAt: setHours(setMinutes(addDays(now, 4), 0), 17), location: "123 Oak Street" },
  ];
  
  for (const event of demoEvents) {
    await storage.createCalendarEvent({
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.location,
      householdId,
    });
  }
  
  // Add sample reactions to some updates and the completed task
  const doneTaskId = createdTaskIds[4]; // "Water plants" task is DONE
  if (doneTaskId) {
    await storage.upsertReaction({
      entityType: "TASK",
      entityId: doneTaskId,
      reactionType: "LOOKS_GOOD",
      userId,
      householdId,
    });
  }
  
  if (createdUpdateIds[0]) {
    await storage.upsertReaction({
      entityType: "UPDATE",
      entityId: createdUpdateIds[0],
      reactionType: "LOVE_IT",
      userId,
      householdId,
    });
  }
  
  if (createdUpdateIds[1]) {
    await storage.upsertReaction({
      entityType: "UPDATE",
      entityId: createdUpdateIds[1],
      reactionType: "SAVE_THIS",
      userId,
      householdId,
    });
  }
  
  // Household Settings
  await storage.upsertHouseholdSettings(householdId, {
    householdId,
    timezone: "America/Chicago",
    primaryAddress: "123 Oak Street, Chicago, IL 60601",
    quietHoursStart: "21:00",
    quietHoursEnd: "07:00",
    entryInstructions: "Please ring doorbell twice. Dogs may bark but are friendly.",
    approvalThreshold: 10000,
    onboardingPhase1Complete: true,
  });
  
  // Household Locations
  const demoLocations = [
    { name: "Lincoln Elementary", type: "SCHOOL" as const, address: "456 School Lane" },
    { name: "Dr. Smith Pediatrics", type: "CLINIC" as const, address: "789 Medical Center Dr" },
    { name: "Whole Foods Market", type: "STORE" as const, address: "321 Grocery Ave" },
  ];
  
  for (const location of demoLocations) {
    await storage.createHouseholdLocation({
      householdId,
      name: location.name,
      type: location.type,
      address: location.address,
    });
  }
  
  // People
  const demoPeople = [
    { fullName: "John Smith", preferredName: "John", role: "PARENT" as const, birthday: new Date("1985-03-15"), celebrationStyle: ["dinner out", "gifts"] },
    { fullName: "Jane Smith", preferredName: "Jane", role: "PARENT" as const, birthday: new Date("1987-07-22"), celebrationStyle: ["experiences"] },
    { fullName: "Tommy Smith", preferredName: "Tommy", role: "CHILD" as const, birthday: new Date("2018-11-08"), allergies: ["peanuts"], dietaryRules: ["nut-free"] },
    { fullName: "Buddy", preferredName: "Buddy", role: "PET" as const },
  ];
  
  for (const person of demoPeople) {
    await storage.createPerson({
      householdId,
      fullName: person.fullName,
      preferredName: person.preferredName,
      role: person.role,
      birthday: person.birthday,
      celebrationStyle: person.celebrationStyle,
      allergies: person.allergies,
      dietaryRules: person.dietaryRules,
    });
  }
  
  // Preferences
  const demoPreferences = [
    { category: "FOOD_DRINK" as const, key: "Coffee", value: "Starbucks Medium Roast", isNoGo: false },
    { category: "PANTRY" as const, key: "Bread", value: "Dave's Killer Bread Whole Wheat", isNoGo: false },
    { category: "GIFTS_FLOWERS" as const, key: "Roses", value: "Never buy - allergic", isNoGo: true },
    { category: "HOME" as const, key: "Cleaning products", value: "Mrs. Meyer's or Method brand only", isNoGo: false },
  ];
  
  for (const pref of demoPreferences) {
    await storage.createPreference({
      householdId,
      category: pref.category,
      key: pref.key,
      value: pref.value,
      isNoGo: pref.isNoGo,
    });
  }
  
  // Important Dates
  const demoImportantDates = [
    { title: "John's Birthday", type: "BIRTHDAY" as const, date: new Date("2026-03-15") },
    { title: "Anniversary", type: "ANNIVERSARY" as const, date: new Date("2026-06-20"), notes: "10th anniversary!" },
    { title: "Tommy's Birthday", type: "BIRTHDAY" as const, date: new Date("2026-11-08") },
  ];
  
  for (const importantDate of demoImportantDates) {
    await storage.createImportantDate({
      householdId,
      title: importantDate.title,
      type: importantDate.type,
      date: importantDate.date,
      notes: importantDate.notes,
    });
  }
  
  // Access Items
  const demoAccessItems = [
    { category: "WIFI" as const, title: "Home WiFi", value: "SmithFamily2024!", notes: "Network name: SmithHome" },
    { category: "ALARM" as const, title: "Front Door Alarm", value: "1234", notes: "Disarm within 30 seconds" },
    { category: "GARAGE" as const, title: "Garage Gate", value: "5678" },
  ];
  
  for (const accessItem of demoAccessItems) {
    await storage.createAccessItem({
      householdId,
      category: accessItem.category,
      title: accessItem.title,
      value: accessItem.value,
      notes: accessItem.notes,
    });
  }
  
  // Quick Request Templates
  const demoQuickRequestTemplates = [
    { title: "Grocery Run", description: "I need groceries picked up", category: "GROCERIES" as const, urgency: "MEDIUM" as const, icon: "ShoppingCart", sortOrder: 1 },
    { title: "Car Service", description: "My car needs to be serviced", category: "ERRANDS" as const, urgency: "MEDIUM" as const, icon: "Car", sortOrder: 2 },
    { title: "Home Repair", description: "Something needs to be fixed at home", category: "MAINTENANCE" as const, urgency: "HIGH" as const, icon: "Wrench", sortOrder: 3 },
    { title: "Schedule Event", description: "I need help scheduling something", category: "EVENTS" as const, urgency: "LOW" as const, icon: "Calendar", sortOrder: 4 },
    { title: "Pet Care", description: "My pet needs something", category: "PETS" as const, urgency: "MEDIUM" as const, icon: "Dog", sortOrder: 5 },
    { title: "Kids Activity", description: "Something for the kids", category: "KIDS" as const, urgency: "MEDIUM" as const, icon: "Baby", sortOrder: 6 },
  ];
  
  for (const template of demoQuickRequestTemplates) {
    await storage.createQuickRequestTemplate({
      householdId,
      title: template.title,
      description: template.description,
      category: template.category,
      urgency: template.urgency,
      icon: template.icon,
      sortOrder: template.sortOrder,
      isActive: true,
    });
  }
}

async function generateMomentsTasks(householdId: string): Promise<number> {
  const importantDates = await storage.getImportantDates(householdId);
  const existingTasks = await storage.getTasks(householdId);
  const now = new Date();
  const fourteenDaysFromNow = addDays(now, 14);
  
  let tasksCreated = 0;
  
  for (const importantDate of importantDates) {
    const dateMonth = getMonth(importantDate.date);
    const dateDay = getDate(importantDate.date);
    
    const thisYearDate = setYear(importantDate.date, now.getFullYear());
    let targetDate = thisYearDate;
    
    if (isBefore(thisYearDate, now)) {
      targetDate = setYear(importantDate.date, now.getFullYear() + 1);
    }
    
    const isWithin14Days = !isBefore(targetDate, now) && !isAfter(targetDate, fourteenDaysFromNow);
    
    if (!isWithin14Days) {
      continue;
    }
    
    const taskTitle = `${importantDate.title} coming up`;
    
    const taskExists = existingTasks.some(task => task.title === taskTitle);
    if (taskExists) {
      continue;
    }
    
    const formattedDate = format(targetDate, "MMMM d");
    const description = `Reminder: ${importantDate.title} on ${formattedDate}.${importantDate.notes ? ` ${importantDate.notes}` : ""}`;
    
    const dueAt = subDays(targetDate, 3);
    
    await storage.createTask({
      title: taskTitle,
      description,
      category: "HOUSEHOLD",
      urgency: "MEDIUM",
      status: "INBOX",
      dueAt,
      createdBy: "system",
      householdId,
    });
    
    tasksCreated++;
  }
  
  return tasksCreated;
}

async function runMomentsAutomation(): Promise<void> {
  try {
    const allHouseholds = await storage.getAllHouseholds();
    let totalTasksCreated = 0;
    
    for (const household of allHouseholds) {
      const tasksCreated = await generateMomentsTasks(household.id);
      totalTasksCreated += tasksCreated;
    }
    
    if (totalTasksCreated > 0) {
      logger.info("Moments Automation created tasks", { totalTasksCreated, householdCount: allHouseholds.length });
    }
  } catch (error) {
    logger.error("Moments Automation error", { error });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  
  app.use("/api/", apiLimiter);
  
  app.use("/api/households", isAuthenticated, householdRoutes);
  app.use(inviteRoutes);
  app.use("/api/files", isAuthenticated, householdContext, fileRoutes);
  app.use("/api/h", isAuthenticated, weeklyBriefRoutes);

  // Serve local uploads
  app.use("/uploads", express.static(join(process.cwd(), "uploads")));
  
  // Google Calendar OAuth Routes
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
  
  app.get("/api/user-profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await storage.getUserProfile(userId);
      
      // If no profile exists, user needs to select role first
      if (!profile) {
        return res.json({ needsRoleSelection: true });
      }
      
      res.json(profile);
    } catch (error) {
      logger.error("Error fetching user profile", { error, userId });
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });
  
  // Set user role (first-time setup)
  app.post("/api/user/role", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const { role } = req.body;
      
      if (!role || !["ASSISTANT", "CLIENT"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      // Check if user already has a profile
      const existingProfile = await storage.getUserProfile(userId);
      if (existingProfile) {
        return res.status(400).json({ message: "Role already set" });
      }
      
      // Create household and profile with selected role
      const household = await storage.createHousehold({ name: "My Household" });
      const profile = await storage.createUserProfile({
        userId,
        householdId: household.id,
        role: role as "ASSISTANT" | "CLIENT",
      });
      
      // Seed demo data for new users
      try {
        await seedDemoData(household.id, userId);
        logger.info("Demo data seeded for new user", { userId });
      } catch (error) {
        logger.error("Error seeding demo data", { error, userId });
      }
      
      res.status(201).json(profile);
    } catch (error) {
      logger.error("Error setting user role", { error, userId });
      res.status(500).json({ message: "Failed to set role" });
    }
  });
  
  app.get("/api/dashboard", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      let [tasks, approvals, events, spending] = await Promise.all([
        storage.getTasks(householdId),
        storage.getApprovals(householdId),
        storage.getCalendarEvents(householdId),
        storage.getSpending(householdId),
      ]);
      
      if (userRole === "STAFF") {
        tasks = tasks.filter(t => t.assignedTo === userId);
        const myTaskIds = new Set(tasks.map(t => t.id));
        approvals = approvals.filter(a => 
          a.createdBy === userId || 
          (a.relatedTaskId && myTaskIds.has(a.relatedTaskId))
        );
      }
      
      let impact = null;
      try {
        impact = await getImpactMetrics(householdId);
      } catch (err) {
        logger.error("Error fetching impact metrics", { error: err, householdId });
      }
      
      res.json({ tasks, approvals, events, spending, impact });
    } catch (error) {
      logger.error("Error fetching dashboard", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });
  
  // Service memberships endpoints
  app.get("/api/services/mine", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      const memberships = await storage.getServiceMemberships(householdId, userId);
      
      // If user has no service memberships, create default based on their role
      if (memberships.length === 0) {
        // For backward compatibility, grant PA service based on current role
        const serviceRole = userRole === "CLIENT" ? "CLIENT" : "PROVIDER";
        const defaultMembership = await storage.createServiceMembership({
          householdId,
          userId,
          serviceType: "PA",
          serviceRole,
          isActive: true,
        });
        memberships.push(defaultMembership);
      }
      
      // Determine default service type
      let defaultServiceType: string | null = null;
      if (memberships.length === 1) {
        defaultServiceType = memberships[0].serviceType;
      }
      
      res.json({
        householdId,
        memberships: memberships.map(m => ({
          serviceType: m.serviceType,
          serviceRole: m.serviceRole,
          isActive: m.isActive,
        })),
        defaultServiceType,
      });
    } catch (error) {
      logger.error("Error fetching service memberships", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch service memberships" });
    }
  });
  
  app.post("/api/services/set-default", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { serviceType } = req.body;
      
      if (!serviceType || !["CLEANING", "PA"].includes(serviceType)) {
        return res.status(400).json({ message: "Invalid service type" });
      }
      
      // Verify user has this service membership
      const memberships = await storage.getServiceMemberships(householdId, userId);
      const hasMembership = memberships.some(m => m.serviceType === serviceType);
      
      if (!hasMembership) {
        return res.status(403).json({ message: "You do not have access to this service" });
      }
      
      // Update user profile with default service type
      const profile = await storage.getUserProfileForHousehold(userId, householdId);
      if (profile) {
        await storage.updateUserProfile(profile.id, { defaultServiceType: serviceType });
      }
      
      res.json({ success: true, defaultServiceType: serviceType });
    } catch (error) {
      logger.error("Error setting default service", { error, householdId, userId });
      res.status(500).json({ message: "Failed to set default service" });
    }
  });
  
  // ============================================
  // CLEANING SERVICE ENDPOINTS
  // ============================================
  
  app.get("/api/addon-services", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const addons = await storage.getAddonServices(householdId);
      res.json(addons);
    } catch (error) {
      logger.error("Error fetching addon services", { error, householdId });
      res.status(500).json({ message: "Failed to fetch addon services" });
    }
  });

  app.post("/api/addon-services", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userProfile = req.userProfile;
      
      if (userProfile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage add-on services" });
      }
      
      const { name, description, priceInCents, estimatedMinutes, category, sortOrder } = req.body;
      
      if (!name || priceInCents === undefined) {
        return res.status(400).json({ message: "Name and price are required" });
      }
      
      const parsedPrice = parseInt(priceInCents, 10);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: "Price must be a valid positive number" });
      }
      
      const addon = await storage.createAddonService({
        householdId,
        name,
        description,
        priceInCents: parsedPrice,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
        category,
        sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
        isActive: true,
      });
      
      res.status(201).json(addon);
    } catch (error) {
      logger.error("Error creating addon service", { error, householdId });
      res.status(500).json({ message: "Failed to create addon service" });
    }
  });

  app.patch("/api/addon-services/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userProfile = req.userProfile;
      const householdId = req.householdId!;
      
      if (userProfile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage add-on services" });
      }
      
      const existing = await storage.getAddonServiceById(id);
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Add-on service not found" });
      }
      
      const { name, description, priceInCents, estimatedMinutes, category, sortOrder, isActive } = req.body;
      
      if (priceInCents !== undefined) {
        const parsedPrice = parseInt(priceInCents, 10);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ message: "Price must be a valid positive number" });
        }
      }
      
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (priceInCents !== undefined) updateData.priceInCents = parseInt(priceInCents, 10);
      if (estimatedMinutes !== undefined) updateData.estimatedMinutes = parseInt(estimatedMinutes, 10);
      if (category !== undefined) updateData.category = category;
      if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder, 10);
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const addon = await storage.updateAddonService(id, updateData);
      res.json(addon);
    } catch (error) {
      logger.error("Error updating addon service", { error, householdId, id });
      res.status(500).json({ message: "Failed to update addon service" });
    }
  });

  app.delete("/api/addon-services/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userProfile = req.userProfile;
      const householdId = req.householdId!;
      
      if (userProfile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage add-on services" });
      }
      
      const existing = await storage.getAddonServiceById(id);
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Add-on service not found" });
      }
      
      await storage.deleteAddonService(id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting addon service", { error, householdId, id });
      res.status(500).json({ message: "Failed to delete addon service" });
    }
  });

  app.get("/api/cleaning/next", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const visit = await storage.getNextCleaningVisit(householdId);
      res.json(visit || null);
    } catch (error) {
      logger.error("Error fetching next cleaning", { error, householdId });
      res.status(500).json({ message: "Failed to fetch next cleaning" });
    }
  });

  app.get("/api/cleaning/visits", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const visits = await storage.getCleaningVisits(householdId);
      res.json(visits);
    } catch (error) {
      logger.error("Error fetching cleaning visits", { error, householdId });
      res.status(500).json({ message: "Failed to fetch cleaning visits" });
    }
  });

  app.post("/api/cleaning/visits", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const visit = await storage.createCleaningVisit({
        ...req.body,
        householdId,
      });
      res.status(201).json(visit);
    } catch (error) {
      logger.error("Error creating cleaning visit", { error, householdId });
      res.status(500).json({ message: "Failed to create cleaning visit" });
    }
  });

  app.patch("/api/cleaning/visits/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const visit = await storage.updateCleaningVisit(id, req.body);
      if (!visit) {
        return res.status(404).json({ message: "Cleaning visit not found" });
      }
      res.json(visit);
    } catch (error) {
      logger.error("Error updating cleaning visit", { error, id });
      res.status(500).json({ message: "Failed to update cleaning visit" });
    }
  });

  app.get("/api/today", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      let [tasks, events] = await Promise.all([
        storage.getTasks(householdId),
        storage.getCalendarEvents(householdId),
      ]);
      
      if (userRole === "STAFF") {
        tasks = tasks.filter(t => t.assignedTo === userId);
      }
      
      res.json({ tasks, events });
    } catch (error) {
      logger.error("Error fetching today data", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch today data" });
    }
  });
  
  app.get("/api/tasks", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
  
  app.post("/api/tasks", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
  
  app.patch("/api/tasks/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
  
  app.delete("/api/tasks/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
  app.post("/api/tasks/:id/complete", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
  app.post("/api/tasks/:id/cancel", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
      
      const { notifyTaskCancelled } = await import("./services/notifications");
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
      
      const { logAudit } = await import("./services/audit");
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
  app.post("/api/tasks/:taskId/checklist", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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

  app.patch("/api/tasks/:taskId/checklist/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
  app.get("/api/task-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  app.post("/api/task-templates", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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

  app.patch("/api/task-templates/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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

  app.delete("/api/task-templates/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
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
  
  app.get("/api/spending", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      const serviceType = req.query.serviceType as string | undefined;
      
      let spending = await storage.getSpending(householdId);
      
      if (userRole === "STAFF") {
        // STAFF can only access CLEANING service spending
        spending = spending.filter(s => s.serviceType === "CLEANING");
      } else if (serviceType && ["CLEANING", "PA"].includes(serviceType)) {
        spending = spending.filter(s => s.serviceType === serviceType);
      }
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 0;
      
      if (limit > 0) {
        const start = (page - 1) * limit;
        const paginated = spending.slice(start, start + limit);
        res.json({
          data: paginated,
          pagination: {
            page,
            limit,
            total: spending.length,
            totalPages: Math.ceil(spending.length / limit),
          },
        });
      } else {
        res.json(spending);
      }
    } catch (error) {
      logger.error("Error fetching spending", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch spending" });
    }
  });
  
  app.post("/api/spending", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const item = await storage.createSpendingItem({
        ...req.body,
        createdBy: userId,
        householdId,
      });
      
      wsManager.broadcast("spending:created", { id: item.id }, householdId, userId);
      
      res.status(201).json(item);
    } catch (error) {
      logger.error("Error creating spending item", { error, householdId, userId });
      res.status(500).json({ message: "Failed to create spending item" });
    }
  });

  // Update spending item status (for payment workflow)
  app.patch("/api/spending/:id/status", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;
      const userRole = req.householdRole;
      
      // Validate status transition
      const validStatuses = ["DRAFT", "NEEDS_APPROVAL", "APPROVED", "PAYMENT_SENT", "RECONCILED"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      // Get current item
      const item = await storage.getSpendingItem(householdId, id);
      if (!item) {
        return res.status(404).json({ message: "Spending item not found" });
      }
      
      // Permission checks based on status transition
      // ASSISTANT can: DRAFT -> NEEDS_APPROVAL, PAYMENT_SENT -> RECONCILED
      // CLIENT can: NEEDS_APPROVAL -> PAYMENT_SENT (when they pay)
      const isAssistant = userRole === "ASSISTANT";
      const isClient = userRole === "CLIENT";
      
      if (status === "NEEDS_APPROVAL" && !isAssistant) {
        return res.status(403).json({ message: "Only assistants can request reimbursement" });
      }
      if (status === "PAYMENT_SENT" && !isClient) {
        return res.status(403).json({ message: "Only clients can mark as paid" });
      }
      if (status === "RECONCILED" && !isAssistant) {
        return res.status(403).json({ message: "Only assistants can reconcile payments" });
      }
      
      // Update the item
      const updateData: any = { status };
      if (status === "PAYMENT_SENT") {
        updateData.paidAt = new Date();
        // Include tip amount and payment method when marking as paid
        const { paymentMethodUsed, paymentNote, tipAmount } = req.body;
        const validPaymentMethods = ["VENMO", "ZELLE", "CASH_APP", "PAYPAL"];
        if (paymentMethodUsed) {
          if (!validPaymentMethods.includes(paymentMethodUsed)) {
            return res.status(400).json({ message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(", ")}` });
          }
          updateData.paymentMethodUsed = paymentMethodUsed;
        }
        if (paymentNote) {
          updateData.paymentNote = paymentNote;
        }
        if (typeof tipAmount === "number" && tipAmount >= 0 && tipAmount <= 50000) {
          updateData.tipAmount = tipAmount;
        }
      }
      if (status === "RECONCILED") {
        updateData.reconciledAt = new Date();
      }
      
      const updated = await storage.updateSpendingItem(householdId, id, updateData);
      
      wsManager.broadcast("spending:updated", { id, status }, householdId, userId);
      
      // Audit log
      const { logAudit } = await import("./services/audit");
      await logAudit({
        householdId,
        userId,
        action: "SPENDING_STATUS_UPDATED",
        entityType: "SPENDING",
        entityId: id,
        before: { status: item.status },
        after: { status },
      });
      
      res.json(updated);
    } catch (error) {
      logger.error("Error updating spending status", { error, householdId, userId, id });
      res.status(500).json({ message: "Failed to update spending status" });
    }
  });

  // Organization Payment Profile endpoints
  app.get("/api/org/payment-profile", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Get the household's organization
      const household = await storage.getHousehold(householdId);
      if (!household?.organizationId) {
        return res.status(404).json({ message: "Household is not linked to an organization. Create an organization first." });
      }
      
      // Get or create payment profile with defaults
      let profile = await storage.getOrganizationPaymentProfile(household.organizationId);
      if (!profile) {
        profile = await storage.upsertOrganizationPaymentProfile(household.organizationId, {});
      }
      
      res.json(profile);
    } catch (error) {
      logger.error("Error fetching org payment profile", { error, householdId });
      res.status(500).json({ message: "Failed to fetch payment profile" });
    }
  });

  app.put("/api/org/payment-profile", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      // Get the household's organization
      const household = await storage.getHousehold(householdId);
      if (!household?.organizationId) {
        return res.status(404).json({ message: "Household is not linked to an organization. Create an organization first." });
      }
      
      const { venmoUsername, zelleRecipient, cashAppCashtag, paypalMeHandle, defaultPaymentMethod, payNoteTemplate } = req.body;
      
      // Validate Venmo username (strip @ and validate chars)
      let cleanVenmo = venmoUsername;
      if (venmoUsername) {
        cleanVenmo = venmoUsername.replace(/^@/, '').trim();
        if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanVenmo)) {
          return res.status(400).json({ message: "Invalid Venmo username. Use letters, numbers, underscores, or dashes." });
        }
      }
      
      // Basic Zelle validation (email or phone)
      if (zelleRecipient && zelleRecipient.length > 100) {
        return res.status(400).json({ message: "Zelle recipient too long" });
      }
      
      // Validate Cash App cashtag (strip $ and validate)
      let cleanCashApp = cashAppCashtag;
      if (cashAppCashtag) {
        cleanCashApp = cashAppCashtag.replace(/^\$/, '').trim();
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(cleanCashApp)) {
          return res.status(400).json({ message: "Invalid Cash App cashtag. Must start with a letter, 1-20 chars." });
        }
      }
      
      // Validate PayPal.me handle
      let cleanPayPal = paypalMeHandle;
      if (paypalMeHandle) {
        cleanPayPal = paypalMeHandle.trim();
        if (!/^[a-zA-Z0-9]{1,50}$/.test(cleanPayPal)) {
          return res.status(400).json({ message: "Invalid PayPal.me handle. Use letters and numbers only." });
        }
      }
      
      // Template length limit
      if (payNoteTemplate && payNoteTemplate.length > 500) {
        return res.status(400).json({ message: "Pay note template too long (max 500 chars)" });
      }
      
      const profile = await storage.upsertOrganizationPaymentProfile(household.organizationId, {
        venmoUsername: cleanVenmo || null,
        zelleRecipient: zelleRecipient || null,
        cashAppCashtag: cleanCashApp || null,
        paypalMeHandle: cleanPayPal || null,
        defaultPaymentMethod: defaultPaymentMethod || "VENMO",
        payNoteTemplate: payNoteTemplate || "hndld • Reimbursement {ref} • {category} • {date}",
      });
      
      // Audit log
      const { logAudit } = await import("./services/audit");
      await logAudit({
        householdId,
        userId,
        action: "ORG_PAYMENT_PROFILE_UPDATED",
        entityType: "SETTINGS",
        entityId: profile.id,
        after: { organizationId: household.organizationId },
      });
      
      res.json(profile);
    } catch (error) {
      logger.error("Error updating org payment profile", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update payment profile" });
    }
  });

  // Household Payment Settings endpoints
  app.get("/api/household/payment-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Get household's override settings
      let override = await storage.getHouseholdPaymentOverride(householdId);
      
      // Also get the org profile if available (for display purposes)
      const household = await storage.getHousehold(householdId);
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      
      res.json({
        override: override || null,
        orgProfile,
      });
    } catch (error) {
      logger.error("Error fetching household payment settings", { error, householdId });
      res.status(500).json({ message: "Failed to fetch payment settings" });
    }
  });

  app.put("/api/household/payment-settings", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { useOrgDefaults, venmoUsername, zelleRecipient, cashAppCashtag, paypalMeHandle, defaultPaymentMethod, payNoteTemplate } = req.body;
      
      // Validate Venmo username
      let cleanVenmo = venmoUsername;
      if (venmoUsername) {
        cleanVenmo = venmoUsername.replace(/^@/, '').trim();
        if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanVenmo)) {
          return res.status(400).json({ message: "Invalid Venmo username" });
        }
      }
      
      // Validate Cash App cashtag
      let cleanCashApp = cashAppCashtag;
      if (cashAppCashtag) {
        cleanCashApp = cashAppCashtag.replace(/^\$/, '').trim();
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(cleanCashApp)) {
          return res.status(400).json({ message: "Invalid Cash App cashtag" });
        }
      }
      
      // Validate PayPal.me handle
      let cleanPayPal = paypalMeHandle;
      if (paypalMeHandle) {
        cleanPayPal = paypalMeHandle.trim();
        if (!/^[a-zA-Z0-9]{1,50}$/.test(cleanPayPal)) {
          return res.status(400).json({ message: "Invalid PayPal.me handle" });
        }
      }
      
      const override = await storage.upsertHouseholdPaymentOverride(householdId, {
        useOrgDefaults: useOrgDefaults !== false,
        venmoUsername: cleanVenmo || null,
        zelleRecipient: zelleRecipient || null,
        cashAppCashtag: cleanCashApp || null,
        paypalMeHandle: cleanPayPal || null,
        defaultPaymentMethod: defaultPaymentMethod || null,
        payNoteTemplate: payNoteTemplate || null,
      });
      
      // Audit log
      const { logAudit } = await import("./services/audit");
      await logAudit({
        householdId,
        userId: req.user!.claims.sub,
        action: "HOUSEHOLD_PAYMENT_OVERRIDE_UPDATED",
        entityType: "SETTINGS",
        entityId: override.id,
        after: { useOrgDefaults: override.useOrgDefaults },
      });
      
      res.json(override);
    } catch (error) {
      logger.error("Error updating household payment settings", { error, householdId });
      res.status(500).json({ message: "Failed to update payment settings" });
    }
  });

  // Pay Options endpoint - returns effective payment info for a spending item
  app.get("/api/spending/:id/pay-options", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Get spending item
      const spending = await storage.getSpendingItem(householdId, req.params.id);
      if (!spending) {
        return res.status(404).json({ message: "Spending item not found" });
      }
      
      // Resolve effective payment profile
      const household = await storage.getHousehold(householdId);
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      
      const householdOverride = await storage.getHouseholdPaymentOverride(householdId);
      
      // Determine effective values
      const useOrgDefaults = !householdOverride || householdOverride.useOrgDefaults;
      
      const venmoUsername = useOrgDefaults 
        ? orgProfile?.venmoUsername 
        : (householdOverride?.venmoUsername || orgProfile?.venmoUsername);
      
      const zelleRecipient = useOrgDefaults
        ? orgProfile?.zelleRecipient
        : (householdOverride?.zelleRecipient || orgProfile?.zelleRecipient);
      
      const cashAppCashtag = useOrgDefaults
        ? orgProfile?.cashAppCashtag
        : (householdOverride?.cashAppCashtag || orgProfile?.cashAppCashtag);
      
      const paypalMeHandle = useOrgDefaults
        ? orgProfile?.paypalMeHandle
        : (householdOverride?.paypalMeHandle || orgProfile?.paypalMeHandle);
      
      const preferredMethod = useOrgDefaults
        ? (orgProfile?.defaultPaymentMethod || "VENMO")
        : (householdOverride?.defaultPaymentMethod || orgProfile?.defaultPaymentMethod || "VENMO");
      
      const noteTemplate = useOrgDefaults
        ? (orgProfile?.payNoteTemplate || "hndld {ref} • {category}")
        : (householdOverride?.payNoteTemplate || orgProfile?.payNoteTemplate || "hndld {ref} • {category}");
      
      // Generate reference code if not already set
      const ref = spending.paymentReferenceCode || `HN-${spending.id.substring(0, 6).toUpperCase()}`;
      
      // Build payment note from template
      const amount = (spending.amount / 100).toFixed(2);
      const paymentNote = noteTemplate
        .replace(/{ref}/g, ref)
        .replace(/{category}/g, spending.category || "General")
        .replace(/{date}/g, new Date(spending.date || Date.now()).toLocaleDateString())
        .replace(/{vendor}/g, spending.vendor || "")
        .replace(/{amount}/g, `$${amount}`);
      
      // Build payment URLs (Venmo: audience=private ensures transaction is private)
      const venmoUrl = venmoUsername 
        ? `https://venmo.com/${venmoUsername}?txn=pay&amount=${amount}&note=${encodeURIComponent(paymentNote)}&audience=private`
        : null;
      
      const cashAppUrl = cashAppCashtag
        ? `https://cash.app/$${cashAppCashtag}/${amount}`
        : null;
      
      const paypalUrl = paypalMeHandle
        ? `https://paypal.me/${paypalMeHandle}/${amount}`
        : null;
      
      // Build display line
      const payToLine = [
        venmoUsername ? `@${venmoUsername} (Venmo)` : null,
        zelleRecipient ? `${zelleRecipient} (Zelle)` : null,
        cashAppCashtag ? `$${cashAppCashtag} (Cash App)` : null,
        paypalMeHandle ? `${paypalMeHandle} (PayPal)` : null,
      ].filter(Boolean).join(" or ");
      
      res.json({
        ref,
        amount: spending.amount,
        note: paymentNote,
        venmo: {
          enabled: !!venmoUsername,
          username: venmoUsername,
          url: venmoUrl,
        },
        zelle: {
          enabled: !!zelleRecipient,
          recipient: zelleRecipient,
          note: paymentNote,
        },
        cashApp: {
          enabled: !!cashAppCashtag,
          cashtag: cashAppCashtag,
          url: cashAppUrl,
        },
        paypal: {
          enabled: !!paypalMeHandle,
          handle: paypalMeHandle,
          url: paypalUrl,
        },
        preferredMethod,
        display: {
          payToLine: payToLine || "Payment method not set up yet",
        },
      });
    } catch (error) {
      logger.error("Error fetching pay options", { error, householdId });
      res.status(500).json({ message: "Failed to fetch pay options" });
    }
  });

  // General pay options endpoint - returns payment profile for the household (client accessible)
  app.get("/api/pay-options", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      // Resolve effective payment profile
      const household = await storage.getHousehold(householdId);
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      
      const householdOverride = await storage.getHouseholdPaymentOverride(householdId);
      
      // Determine effective values
      const useOrgDefaults = !householdOverride || householdOverride.useOrgDefaults;
      
      const venmoUsername = useOrgDefaults 
        ? orgProfile?.venmoUsername 
        : (householdOverride?.venmoUsername || orgProfile?.venmoUsername);
      
      const zelleRecipient = useOrgDefaults
        ? orgProfile?.zelleRecipient
        : (householdOverride?.zelleRecipient || orgProfile?.zelleRecipient);
      
      const cashAppCashtag = useOrgDefaults
        ? orgProfile?.cashAppCashtag
        : (householdOverride?.cashAppCashtag || orgProfile?.cashAppCashtag);
      
      const paypalMeHandle = useOrgDefaults
        ? orgProfile?.paypalMeHandle
        : (householdOverride?.paypalMeHandle || orgProfile?.paypalMeHandle);
      
      const defaultPaymentMethod = useOrgDefaults
        ? (orgProfile?.defaultPaymentMethod || "VENMO")
        : (householdOverride?.defaultPaymentMethod || orgProfile?.defaultPaymentMethod || "VENMO");
      
      const payNoteTemplate = useOrgDefaults
        ? (orgProfile?.payNoteTemplate || "hndld • Reimbursement {ref} • {category} • {date}")
        : (householdOverride?.payNoteTemplate || orgProfile?.payNoteTemplate || "hndld • Reimbursement {ref} • {category} • {date}");
      
      res.json({
        venmoUsername: venmoUsername || null,
        zelleRecipient: zelleRecipient || null,
        cashAppCashtag: cashAppCashtag || null,
        paypalMeHandle: paypalMeHandle || null,
        defaultPaymentMethod,
        payNoteTemplate,
      });
    } catch (error) {
      logger.error("Error fetching pay options", { error, householdId });
      res.status(500).json({ message: "Failed to fetch pay options" });
    }
  });
  
  // ==================== INVOICE ENDPOINTS ====================

  // POST /api/invoices/send - Assistant sends an invoice
  app.post("/api/invoices/send", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;
      const { title, amount, note, dueDate } = req.body;

      if (!title || !amount) {
        return res.status(400).json({ message: "Title and amount are required" });
      }

      // Get household for display name
      const household = await storage.getHousehold(householdId);
      
      // Generate invoice number: INV-YYYYMMDD-XXXXX
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const invoiceNumber = `INV-${dateStr}-${randomSuffix}`;

      // Create spending item as invoice
      const spending = await storage.createSpendingItem({
        amount,
        category: "Invoice",
        vendor: "hndld Concierge",
        note: note || null,
        householdId,
        createdBy: userId,
        status: "APPROVED", // Client action is to pay, not approve
        kind: "INVOICE",
        title,
        dueDate: dueDate ? new Date(dueDate) : null,
        invoiceNumber,
        sentAt: now,
        paymentReferenceCode: invoiceNumber,
      });

      // Get payment options for the invoice document
      let orgProfile = null;
      if (household?.organizationId) {
        orgProfile = await storage.getOrganizationPaymentProfile(household.organizationId);
      }
      const householdOverride = await storage.getHouseholdPaymentOverride(householdId);
      const useOrgDefaults = !householdOverride || householdOverride.useOrgDefaults;
      
      const venmoUsername = useOrgDefaults 
        ? orgProfile?.venmoUsername 
        : (householdOverride?.venmoUsername || orgProfile?.venmoUsername);
      const zelleRecipient = useOrgDefaults
        ? orgProfile?.zelleRecipient
        : (householdOverride?.zelleRecipient || orgProfile?.zelleRecipient);
      const cashAppCashtag = useOrgDefaults
        ? orgProfile?.cashAppCashtag
        : (householdOverride?.cashAppCashtag || orgProfile?.cashAppCashtag);
      const paypalMeHandle = useOrgDefaults
        ? orgProfile?.paypalMeHandle
        : (householdOverride?.paypalMeHandle || orgProfile?.paypalMeHandle);

      // Generate HTML invoice document with escaped user input
      const safeTitle = escapeHtml(title);
      const safeNote = note ? escapeHtml(note) : "";
      const safeHouseholdName = escapeHtml(household?.name || "—");
      const storagePath = `invoices/${invoiceNumber}.html`;
      
      const invoiceHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; color: #1D2A44; }
    .header { border-bottom: 2px solid #E7D8B1; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1D2A44; }
    .invoice-title { font-size: 32px; font-weight: 300; margin: 10px 0; }
    .details { margin: 30px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .amount { font-size: 36px; font-weight: bold; color: #1D2A44; margin: 30px 0; }
    .payment-section { background: #F6F2EA; padding: 20px; border-radius: 8px; margin-top: 30px; }
    .payment-title { font-weight: 600; margin-bottom: 15px; }
    .payment-method { margin: 10px 0; }
    .footer { margin-top: 40px; text-align: center; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">hndld</div>
    <div class="invoice-title">Invoice</div>
  </div>
  
  <div class="details">
    <div class="detail-row"><span>Invoice Number</span><span>${invoiceNumber}</span></div>
    <div class="detail-row"><span>Household</span><span>${safeHouseholdName}</span></div>
    <div class="detail-row"><span>Date</span><span>${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span></div>
    ${dueDate ? `<div class="detail-row"><span>Due Date</span><span>${new Date(dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span></div>` : ""}
  </div>
  
  <div class="detail-row"><span style="font-weight: 600;">${safeTitle}</span></div>
  ${safeNote ? `<div style="color: #666; margin-top: 10px;">${safeNote}</div>` : ""}
  
  <div class="amount">$${(amount / 100).toFixed(2)}</div>
  
  <div class="payment-section">
    <div class="payment-title">Payment Instructions</div>
    ${venmoUsername ? `<div class="payment-method">Venmo: <a href="https://venmo.com/${escapeHtml(venmoUsername)}">@${escapeHtml(venmoUsername)}</a></div>` : ""}
    ${zelleRecipient ? `<div class="payment-method">Zelle: ${escapeHtml(zelleRecipient)}</div>` : ""}
    ${cashAppCashtag ? `<div class="payment-method">Cash App: <a href="https://cash.app/$${escapeHtml(cashAppCashtag)}">$${escapeHtml(cashAppCashtag)}</a></div>` : ""}
    ${paypalMeHandle ? `<div class="payment-method">PayPal: <a href="https://paypal.me/${escapeHtml(paypalMeHandle)}">paypal.me/${escapeHtml(paypalMeHandle)}</a></div>` : ""}
    ${!venmoUsername && !zelleRecipient && !cashAppCashtag && !paypalMeHandle ? `<div class="payment-method">Contact your assistant for payment details.</div>` : ""}
    <div style="margin-top: 10px; font-size: 12px; color: #666;">Reference: ${invoiceNumber}</div>
  </div>
  
  <div class="footer">White-glove household operations, handled.</div>
</body>
</html>`;

      // Write the invoice file to storage
      await getStorageProvider().upload(storagePath, Buffer.from(invoiceHtml, "utf8"), "text/html");

      // Save invoice document to files table
      const [invoiceFile] = await db
        .insert(files)
        .values({
          householdId,
          uploadedBy: userId,
          filename: `${invoiceNumber}.html`,
          storedFilename: `${invoiceNumber}.html`,
          mimeType: "text/html",
          fileSize: Buffer.byteLength(invoiceHtml, "utf8"),
          storageProvider: "LOCAL",
          storagePath,
          category: "DOCUMENT",
          tags: ["invoice", invoiceNumber],
          description: `Invoice ${invoiceNumber} • ${title}`,
        })
        .returning();

      // Link file to spending item
      await db.insert(fileLinks).values({
        fileId: invoiceFile.id,
        entityType: "SPENDING",
        entityId: spending.id,
        linkedBy: userId,
      });

      // Create an update to notify the client
      const amountFormatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount / 100);

      await storage.createUpdate({
        text: `Invoice sent: ${title} • ${amountFormatted}`,
        householdId,
        createdBy: userId,
        receipts: [invoiceFile.id],
      });

      res.json({
        success: true,
        invoiceId: spending.id,
        invoiceNumber,
        fileId: invoiceFile.id,
      });
    } catch (error) {
      logger.error("Error sending invoice", { error, householdId, userId });
      res.status(500).json({ message: "Failed to send invoice" });
    }
  });

  // GET /api/invoices/pending - Client checks if they have unpaid invoices
  app.get("/api/invoices/pending", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const serviceType = req.query.serviceType as string | undefined;

      // Build conditions
      const conditions = [
        eq(spendingItems.householdId, householdId),
        eq(spendingItems.kind, "INVOICE"),
        eq(spendingItems.status, "APPROVED")
      ];
      
      // Filter by service type if provided
      if (serviceType === "CLEANING" || serviceType === "PA") {
        conditions.push(eq(spendingItems.serviceType, serviceType));
      }

      // Get unpaid invoices (APPROVED = ready to pay)
      const pendingInvoices = await db
        .select()
        .from(spendingItems)
        .where(and(...conditions))
        .orderBy(sql`${spendingItems.sentAt} DESC`);

      if (pendingInvoices.length === 0) {
        return res.json({
          count: 0,
          totalAmount: 0,
          latestInvoiceId: null,
          latestInvoiceTitle: null,
          latestInvoiceNumber: null,
          latestDueDate: null,
        });
      }

      const totalAmount = pendingInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const latest = pendingInvoices[0];

      res.json({
        count: pendingInvoices.length,
        totalAmount,
        latestInvoiceId: latest.id,
        latestInvoiceTitle: latest.title,
        latestInvoiceNumber: latest.invoiceNumber,
        latestDueDate: latest.dueDate,
      });
    } catch (error) {
      logger.error("Error fetching pending invoices", { error, householdId });
      res.status(500).json({ message: "Failed to fetch pending invoices" });
    }
  });

  // GET /api/invoices - List all invoices
  app.get("/api/invoices", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;

      const invoicesList = await db
        .select()
        .from(spendingItems)
        .where(
          and(
            eq(spendingItems.householdId, householdId),
            eq(spendingItems.kind, "INVOICE")
          )
        )
        .orderBy(sql`${spendingItems.sentAt} DESC`);

      res.json(invoicesList);
    } catch (error) {
      logger.error("Error fetching invoices", { error, householdId });
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // ==================== END INVOICE ENDPOINTS ====================

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

  // Helper function to get user profile with role
  async function getUserProfile(userId: string) {
    return storage.getUserProfile(userId);
  }

  // ============================================
  // HOUSEHOLD CONCIERGE ENDPOINTS
  // ============================================

  // Onboarding Status Endpoints
  app.get("/api/onboarding/status", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const settings = await storage.getHouseholdSettings(householdId);
      
      res.json({
        phase1Complete: settings?.onboardingPhase1Complete ?? false,
        phase2Complete: settings?.onboardingPhase2Complete ?? false,
        phase3Complete: settings?.onboardingPhase3Complete ?? false,
      });
    } catch (error) {
      logger.error("Error fetching onboarding status", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  app.post("/api/onboarding/complete-phase", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can complete onboarding phases" });
      }
      
      const phaseSchema = z.object({
        phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      });
      
      const parseResult = phaseSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid phase. Must be 1, 2, or 3" });
      }
      
      const { phase } = parseResult.data;
      const updateData: any = {};
      
      if (phase === 1) updateData.onboardingPhase1Complete = true;
      if (phase === 2) updateData.onboardingPhase2Complete = true;
      if (phase === 3) updateData.onboardingPhase3Complete = true;
      
      const settings = await storage.upsertHouseholdSettings(householdId, updateData);
      
      res.json({
        phase1Complete: settings.onboardingPhase1Complete,
        phase2Complete: settings.onboardingPhase2Complete,
        phase3Complete: settings.onboardingPhase3Complete,
      });
    } catch (error) {
      logger.error("Error completing onboarding phase", { error, userId, householdId });
      res.status(500).json({ message: "Failed to complete onboarding phase" });
    }
  });

  app.post("/api/onboarding/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const settings = req.body;
      
      await storage.upsertHouseholdSettings(householdId, {
        ...settings,
        householdId,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error saving onboarding settings", { error, householdId });
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.post("/api/onboarding/save-step", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { step, data } = req.body;
      const householdId = req.householdId!;
      
      switch (step) {
        case "basics":
          await storage.upsertHouseholdSettings(householdId, {
            ...data,
            householdId,
          });
          break;
          
        case "people":
          if (Array.isArray(data.people)) {
            for (const person of data.people) {
              await storage.createPerson({
                householdId,
                ...person,
              });
            }
          }
          break;
          
        case "preferences":
          if (Array.isArray(data.preferences)) {
            for (const pref of data.preferences) {
              await storage.createPreference({
                householdId,
                ...pref,
              });
            }
          }
          break;
          
        case "dates":
          if (Array.isArray(data.dates)) {
            for (const date of data.dates) {
              await storage.createImportantDate({
                householdId,
                ...date,
              });
            }
          }
          break;
          
        case "locations":
          if (Array.isArray(data.locations)) {
            for (const location of data.locations) {
              await storage.createHouseholdLocation({
                householdId,
                ...location,
              });
            }
          }
          break;
          
        case "access":
          if (Array.isArray(data.accessItems)) {
            for (const item of data.accessItems) {
              await storage.createAccessItem({
                householdId,
                ...item,
              });
            }
          }
          break;
          
        default:
          return res.status(400).json({ error: `Unknown step: ${step}` });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error saving onboarding step", { error, householdId });
      res.status(500).json({ error: "Failed to save step data" });
    }
  });

  // Get current household (for service type detection)
  app.get("/api/household", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const [household] = await db
        .select()
        .from(households)
        .where(eq(households.id, householdId))
        .limit(1);
      
      if (!household) {
        return res.status(404).json({ message: "Household not found" });
      }
      
      res.json(household);
    } catch (error) {
      logger.error("Error fetching household", { error, householdId });
      res.status(500).json({ message: "Failed to fetch household" });
    }
  });

  // Household Settings Endpoints
  app.get("/api/household/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      let settings = await storage.getHouseholdSettings(householdId);
      
      if (!settings) {
        settings = await storage.upsertHouseholdSettings(householdId, {});
      }
      
      res.json(settings);
    } catch (error) {
      logger.error("Error fetching household settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch household settings" });
    }
  });

  app.put("/api/household/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update household settings" });
      }
      
      const settings = await storage.upsertHouseholdSettings(householdId, req.body);
      res.json(settings);
    } catch (error) {
      logger.error("Error updating household settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update household settings" });
    }
  });

  // Household Locations Endpoints
  app.get("/api/household/locations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const locations = await storage.getHouseholdLocations(householdId);
      res.json(locations);
    } catch (error) {
      logger.error("Error fetching household locations", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch household locations" });
    }
  });

  app.post("/api/household/locations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create locations" });
      }
      
      const location = await storage.createHouseholdLocation({
        ...req.body,
        householdId,
      });
      
      res.status(201).json(location);
    } catch (error) {
      logger.error("Error creating household location", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create household location" });
    }
  });

  app.put("/api/household/locations/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update locations" });
      }
      
      const location = await storage.updateHouseholdLocation(householdId, req.params.id, req.body);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      logger.error("Error updating household location", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update household location" });
    }
  });

  app.delete("/api/household/locations/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deleteHouseholdLocation(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Location not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting household location", { error, householdId });
      res.status(500).json({ message: "Failed to delete household location" });
    }
  });

  // People Endpoints
  app.get("/api/people", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const people = await storage.getPeople(householdId);
      res.json(people);
    } catch (error) {
      logger.error("Error fetching people", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch people" });
    }
  });

  app.post("/api/people", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create people" });
      }
      
      const person = await storage.createPerson({
        ...req.body,
        householdId,
      });
      
      res.status(201).json(person);
    } catch (error) {
      logger.error("Error creating person", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create person" });
    }
  });

  app.put("/api/people/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update people" });
      }
      
      const person = await storage.updatePerson(householdId, req.params.id, req.body);
      if (!person) {
        return res.status(404).json({ message: "Person not found" });
      }
      res.json(person);
    } catch (error) {
      logger.error("Error updating person", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update person" });
    }
  });

  app.delete("/api/people/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deletePerson(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Person not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting person", { error, householdId });
      res.status(500).json({ message: "Failed to delete person" });
    }
  });

  // Preferences Endpoints
  app.get("/api/preferences", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const preferences = await storage.getPreferences(householdId);
      res.json(preferences);
    } catch (error) {
      logger.error("Error fetching preferences", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.post("/api/preferences", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create preferences" });
      }
      
      const preference = await storage.createPreference({
        ...req.body,
        householdId,
        createdByUserId: userId,
      });
      
      res.status(201).json(preference);
    } catch (error) {
      logger.error("Error creating preference", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create preference" });
    }
  });

  app.put("/api/preferences/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update preferences" });
      }
      
      const preference = await storage.updatePreference(householdId, req.params.id, req.body);
      if (!preference) {
        return res.status(404).json({ message: "Preference not found" });
      }
      res.json(preference);
    } catch (error) {
      logger.error("Error updating preference", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update preference" });
    }
  });

  app.delete("/api/preferences/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deletePreference(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Preference not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting preference", { error, householdId });
      res.status(500).json({ message: "Failed to delete preference" });
    }
  });

  // Important Dates Endpoints
  app.get("/api/important-dates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const importantDates = await storage.getImportantDates(householdId);
      res.json(importantDates);
    } catch (error) {
      logger.error("Error fetching important dates", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch important dates" });
    }
  });

  app.post("/api/important-dates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create important dates" });
      }
      
      const importantDate = await storage.createImportantDate({
        ...req.body,
        householdId,
      });
      
      res.status(201).json(importantDate);
    } catch (error) {
      logger.error("Error creating important date", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create important date" });
    }
  });

  app.put("/api/important-dates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update important dates" });
      }
      
      const importantDate = await storage.updateImportantDate(householdId, req.params.id, req.body);
      if (!importantDate) {
        return res.status(404).json({ message: "Important date not found" });
      }
      res.json(importantDate);
    } catch (error) {
      logger.error("Error updating important date", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update important date" });
    }
  });

  app.delete("/api/important-dates/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deleteImportantDate(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Important date not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting important date", { error, householdId });
      res.status(500).json({ message: "Failed to delete important date" });
    }
  });

  // Access Items Endpoints
  app.get("/api/access-items", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      let accessItems = await storage.getAccessItems(householdId);
      
      if (userRole === "STAFF") {
        const grants = await storage.getActiveGrantsForUser(userId, householdId);
        const grantedItemIds = new Set(grants.map(g => g.accessItemId));
        accessItems = accessItems.filter(item => grantedItemIds.has(item.id));
        const maskedItems = accessItems.map(item => ({
          ...item,
          value: item.isSensitive ? "********" : item.value,
        }));
        res.json(maskedItems);
      } else if (userRole === "ASSISTANT") {
        res.json(accessItems);
      } else {
        const maskedItems = accessItems.map(item => ({
          ...item,
          value: item.isSensitive ? "********" : item.value,
        }));
        res.json(maskedItems);
      }
    } catch (error) {
      logger.error("Error fetching access items", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch access items" });
    }
  });

  app.post("/api/access-items", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create access items" });
      }
      
      const data = req.body;
      const encryptedValue = data.isSensitive 
        ? encryptVaultValue(data.value)
        : data.value;
      
      const accessItem = await storage.createAccessItem({
        ...data,
        value: encryptedValue,
        isEncrypted: data.isSensitive ?? false,
        householdId,
      });
      
      res.status(201).json({
        ...accessItem,
        value: data.isSensitive ? "********" : data.value,
      });
    } catch (error) {
      logger.error("Error creating access item", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create access item" });
    }
  });

  app.put("/api/access-items/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const data = req.body;
      
      if (data.value !== undefined) {
        const isSensitive = data.isSensitive ?? true;
        data.value = isSensitive 
          ? encryptVaultValue(data.value)
          : data.value;
        data.isEncrypted = isSensitive;
      }
      
      const accessItem = await storage.updateAccessItem(householdId, req.params.id, data);
      if (!accessItem) {
        return res.status(404).json({ message: "Access item not found" });
      }
      res.json({
        ...accessItem,
        value: accessItem.isSensitive ? "********" : accessItem.value,
      });
    } catch (error) {
      logger.error("Error updating access item", { error, householdId });
      res.status(500).json({ message: "Failed to update access item" });
    }
  });

  app.delete("/api/access-items/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deleteAccessItem(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Access item not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting access item", { error, householdId });
      res.status(500).json({ message: "Failed to delete access items" });
    }
  });

  app.post("/api/access-items/:id/reveal", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      const item = await storage.getAccessItem(householdId, id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (userRole === "STAFF") {
        const grant = await storage.getAccessItemGrantForUser(id, userId, householdId);
        if (!grant || (grant.expiresAt && new Date(grant.expiresAt) < new Date())) {
          return res.status(403).json({ error: "No active grant for this item" });
        }
      } else if (userRole !== "ASSISTANT") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const decryptedValue = item.isEncrypted 
        ? decryptVaultValue(item.value)
        : item.value;
      
      res.json({ value: decryptedValue });
    } catch (error) {
      logger.error("Error revealing access item", { error, userId, householdId });
      res.status(500).json({ error: "Failed to reveal item" });
    }
  });

  // Access Item Grants (for STAFF access management)
  app.get("/api/access-items/:id/grants", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const householdId = req.householdId!;
      
      const item = await storage.getAccessItem(householdId, id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const grants = await storage.getAccessItemGrants(id);
      res.json(grants);
    } catch (error) {
      logger.error("Error fetching access item grants", { error, householdId });
      res.status(500).json({ error: "Failed to fetch grants" });
    }
  });

  app.post("/api/access-items/:id/grants", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId: grantUserId, expiresAt } = req.body;
      const grantedBy = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const item = await storage.getAccessItem(householdId, id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const grant = await storage.createAccessItemGrant({
        accessItemId: id,
        userId: grantUserId,
        householdId,
        createdBy: grantedBy,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      
      res.status(201).json(grant);
    } catch (error) {
      logger.error("Error creating access item grant", { error, householdId });
      res.status(500).json({ error: "Failed to create grant" });
    }
  });

  app.delete("/api/access-items/:id/grants/:grantId", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const { grantId } = req.params;
      
      const deleted = await storage.deleteAccessItemGrant(grantId);
      if (!deleted) {
        return res.status(404).json({ error: "Grant not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting access item grant", { error, grantId });
      res.status(500).json({ error: "Failed to delete grant" });
    }
  });

  // Quick Request Templates Endpoints
  app.get("/api/quick-request-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const templates = await storage.getQuickRequestTemplates(householdId);
      res.json(templates.filter(t => t.isActive));
    } catch (error) {
      logger.error("Error fetching quick request templates", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch quick request templates" });
    }
  });

  app.get("/api/quick-request-templates/all", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view all templates" });
      }
      
      const templates = await storage.getQuickRequestTemplates(householdId);
      res.json(templates);
    } catch (error) {
      logger.error("Error fetching all quick request templates", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch quick request templates" });
    }
  });

  app.post("/api/quick-request-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create templates" });
      }
      
      const validatedData = insertQuickRequestTemplateSchema.parse({
        ...req.body,
        householdId,
      });
      
      const template = await storage.createQuickRequestTemplate(validatedData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error creating quick request template", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create quick request template" });
    }
  });

  app.patch("/api/quick-request-templates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update templates" });
      }
      
      const updateSchema = insertQuickRequestTemplateSchema.partial().omit({ householdId: true });
      const validatedData = updateSchema.parse(req.body);
      
      const template = await storage.updateQuickRequestTemplate(householdId, req.params.id, validatedData);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error updating quick request template", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update quick request template" });
    }
  });

  app.delete("/api/quick-request-templates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can delete templates" });
      }
      
      const deleted = await storage.deleteQuickRequestTemplate(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting quick request template", { error, userId, householdId });
      res.status(500).json({ message: "Failed to delete quick request template" });
    }
  });

  // Playbooks (SOP Templates) Endpoints
  app.get("/api/playbooks", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const playbooksList = await storage.getPlaybooks(householdId);
      res.json(playbooksList);
    } catch (error) {
      logger.error("Error fetching playbooks", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch playbooks" });
    }
  });

  app.get("/api/playbooks/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const playbook = await storage.getPlaybook(householdId, req.params.id);
      if (!playbook) {
        return res.status(404).json({ message: "Playbook not found" });
      }
      
      const steps = await storage.getPlaybookSteps(playbook.id);
      res.json({ ...playbook, steps });
    } catch (error) {
      logger.error("Error fetching playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch playbook" });
    }
  });

  app.post("/api/playbooks", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create playbooks" });
      }
      
      const { steps, ...playbookData } = req.body;
      const validatedData = insertPlaybookSchema.parse({
        ...playbookData,
        householdId,
        createdBy: userId,
      });
      
      const playbook = await storage.createPlaybook(validatedData);
      
      if (steps && Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const stepData = insertPlaybookStepSchema.parse({
            ...steps[i],
            playbookId: playbook.id,
            stepNumber: i + 1,
          });
          await storage.createPlaybookStep(stepData);
        }
      }
      
      const createdSteps = await storage.getPlaybookSteps(playbook.id);
      res.status(201).json({ ...playbook, steps: createdSteps });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error creating playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create playbook" });
    }
  });

  app.patch("/api/playbooks/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update playbooks" });
      }
      
      const existing = await storage.getPlaybook(householdId, req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Playbook not found" });
      }
      
      const { steps, ...playbookData } = req.body;
      const updateSchema = insertPlaybookSchema.partial().omit({ householdId: true, createdBy: true });
      const validatedData = updateSchema.parse(playbookData);
      
      const playbook = await storage.updatePlaybook(householdId, req.params.id, validatedData);
      
      if (steps && Array.isArray(steps)) {
        const existingSteps = await storage.getPlaybookSteps(req.params.id);
        for (const step of existingSteps) {
          await storage.deletePlaybookStep(householdId, req.params.id, step.id);
        }
        
        for (let i = 0; i < steps.length; i++) {
          const stepData = insertPlaybookStepSchema.parse({
            ...steps[i],
            playbookId: req.params.id,
            stepNumber: i + 1,
          });
          await storage.createPlaybookStep(stepData);
        }
      }
      
      const updatedSteps = await storage.getPlaybookSteps(req.params.id);
      res.json({ ...playbook, steps: updatedSteps });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error updating playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update playbook" });
    }
  });

  app.delete("/api/playbooks/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can delete playbooks" });
      }
      
      const deleted = await storage.deletePlaybook(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Playbook not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to delete playbook" });
    }
  });

  // ============================================
  // AUDIT LOG ROUTES
  // ============================================
  
  app.get("/api/audit-logs", isAuthenticated, householdContext, requirePermission("CAN_VIEW_AUDIT_LOG"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view audit logs" });
      }
      
      const { entityType, startDate, endDate, limit, offset } = req.query;
      
      const { getAuditLogs } = await import("./services/audit");
      const logs = await getAuditLogs(householdId, {
        entityType: entityType as any,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
      });
      
      res.json(logs);
    } catch (error) {
      logger.error("Error fetching audit logs", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // ============================================
  // VAULT SETTINGS ROUTES
  // ============================================
  
  app.get("/api/vault/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage vault settings" });
      }
      
      const settings = await storage.getVaultSettings(householdId);
      res.json(settings || { 
        householdId, 
        pinHash: null, 
        autoLockMinutes: 5, 
        requirePinForSensitive: true 
      });
    } catch (error) {
      logger.error("Error fetching vault settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch vault settings" });
    }
  });

  app.post("/api/vault/set-pin", authLimiter, isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can set vault PIN" });
      }
      
      const { pin } = req.body;
      if (!pin || pin.length < 4) {
        return res.status(400).json({ message: "PIN must be at least 4 characters" });
      }
      
      const bcrypt = await import("bcrypt");
      const pinHash = await bcrypt.hash(pin, 10);
      
      await storage.upsertVaultSettings(householdId, { pinHash });
      
      const { logAudit } = await import("./services/audit");
      await logAudit({
        householdId,
        userId,
        action: "VAULT_PIN_SET",
        entityType: "VAULT",
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error setting vault PIN", { error, userId, householdId });
      res.status(500).json({ message: "Failed to set vault PIN" });
    }
  });

  app.post("/api/vault/verify-pin", authLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ message: "PIN required" });
      }
      
      const settings = await storage.getVaultSettings(householdId);
      if (!settings?.pinHash) {
        return res.status(400).json({ message: "No PIN set" });
      }
      
      const bcrypt = await import("bcrypt");
      const valid = await bcrypt.compare(pin, settings.pinHash);
      
      const { logAudit } = await import("./services/audit");
      await logAudit({
        householdId,
        userId,
        action: valid ? "VAULT_UNLOCK_SUCCESS" : "VAULT_UNLOCK_FAILED",
        entityType: "VAULT",
      });
      
      if (!valid) {
        return res.status(401).json({ message: "Invalid PIN" });
      }
      
      const expiresAt = Date.now() + (settings.autoLockMinutes || 5) * 60 * 1000;
      (req.session as any).vaultUnlocked = true;
      (req.session as any).vaultExpiresAt = expiresAt;
      (req.session as any).vaultHouseholdId = householdId;
      
      res.json({ 
        success: true, 
        expiresIn: (settings.autoLockMinutes || 5) * 60 * 1000 
      });
    } catch (error) {
      logger.error("Error verifying vault PIN", { error, userId, householdId });
      res.status(500).json({ message: "Failed to verify PIN" });
    }
  });

  // ============================================
  // HANDOFF PACKET ROUTES
  // ============================================
  
  app.get("/api/handoff", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can generate handoff packets" });
      }
      
      const { generateHandoffPacket, generateHandoffHTML } = await import("./services/handoff");
      const data = await generateHandoffPacket(householdId);
      const html = generateHandoffHTML(data);
      
      const { logAudit } = await import("./services/audit");
      await logAudit({
        householdId,
        userId,
        action: "HANDOFF_GENERATED",
        entityType: "HOUSEHOLD",
        entityId: householdId,
      });
      
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition", `inline; filename="handoff-packet.html"`);
      res.send(html);
    } catch (error) {
      logger.error("Error generating handoff packet", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate handoff packet" });
    }
  });
  
  app.get("/api/handoff/data", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can access handoff data" });
      }
      
      const { generateHandoffPacket } = await import("./services/handoff");
      const data = await generateHandoffPacket(householdId);
      
      res.json(data);
    } catch (error) {
      logger.error("Error generating handoff data", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate handoff data" });
    }
  });

  app.get("/api/moments/generate", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can generate moment tasks" });
      }
      
      const tasksCreated = await generateMomentsTasks(householdId);
      
      res.json({
        tasksCreated,
        message: tasksCreated > 0 
          ? `Successfully created ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} for upcoming important dates`
          : "No new tasks to create for upcoming important dates"
      });
    } catch (error) {
      logger.error("Error generating moment tasks", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate moment tasks" });
    }
  });

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  setInterval(runMomentsAutomation, TWENTY_FOUR_HOURS_MS);
  runMomentsAutomation();

  // Start scheduled backups
  startScheduledBackups();

  // ============================================
  // NOTIFICATIONS ROUTES
  // ============================================

  app.get("/api/notifications", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const notificationsList = await getNotifications(userId, householdId);
      res.json(notificationsList);
    } catch (error) {
      logger.error("Error fetching notifications", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const count = await getUnreadCount(userId, householdId);
      res.json({ count });
    } catch (error) {
      logger.error("Error fetching unread count", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      await markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking notification read", { error, notificationId: req.params.id });
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/mark-all-read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      await markAllNotificationsRead(userId, householdId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking all notifications read", { error, userId, householdId });
      res.status(500).json({ message: "Failed to mark all notifications read" });
    }
  });

  app.get("/api/notification-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const settings = await getNotificationSettings(userId);
      res.json(settings || {});
    } catch (error) {
      logger.error("Error fetching notification settings", { error, userId });
      res.status(500).json({ message: "Failed to fetch notification settings" });
    }
  });

  app.patch("/api/notification-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const settings = await upsertNotificationSettings(userId, householdId, req.body);
      res.json(settings);
    } catch (error) {
      logger.error("Error updating notification settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update notification settings" });
    }
  });

  // ============================================
  // AI SUGGESTIONS ROUTES
  // ============================================

  app.get("/api/suggestions", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const suggestions = await getSmartSuggestions(householdId);
      res.json(suggestions);
    } catch (error) {
      logger.error("Error fetching suggestions", { error, householdId });
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  // ============================================
  // PUSH NOTIFICATIONS ROUTES
  // ============================================

  app.get("/api/push/vapid-key", async (_req, res) => {
    const publicKey = getVapidPublicKey();
    res.json({ 
      publicKey,
      enabled: isPushEnabled(),
    });
  });

  app.post("/api/push/subscribe", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { endpoint, keys, userAgent } = req.body;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }

      await savePushSubscription({
        userId,
        householdId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || req.headers["user-agent"],
      });

      res.json({ success: true });
    } catch (error) {
      logger.error("Error saving push subscription", { error, userId, householdId });
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.post("/api/push/unsubscribe", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({ message: "Endpoint required" });
      }

      await removePushSubscription(userId, endpoint);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error removing push subscription", { error, userId });
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  app.get("/api/push/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const subscriptions = await getUserSubscriptions(userId);
      res.json(subscriptions.map(s => ({ 
        id: s.id, 
        endpoint: s.endpoint,
        createdAt: s.createdAt 
      })));
    } catch (error) {
      logger.error("Error fetching subscriptions", { error, userId });
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  });

  // ============================================
  // GLOBAL SEARCH ROUTE
  // ============================================

  app.get("/api/search", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const query = (req.query.q as string || "").toLowerCase().trim();
      const types = (req.query.types as string || "tasks,updates,vendors,preferences").split(",");
      const status = req.query.status as string;
      
      if (!query || query.length < 2) {
        return res.json({ tasks: [], updates: [], vendors: [], preferences: [], totalCount: 0 });
      }

      const results: {
        tasks: any[];
        updates: any[];
        vendors: any[];
        preferences: any[];
        totalCount: number;
      } = { tasks: [], updates: [], vendors: [], preferences: [], totalCount: 0 };

      if (types.includes("tasks")) {
        const allTasks = await storage.getTasks(householdId);
        results.tasks = allTasks.filter(t => {
          const matchesQuery = t.title.toLowerCase().includes(query) || 
                               (t.description?.toLowerCase().includes(query)) ||
                               (t.location?.toLowerCase().includes(query));
          const matchesStatus = !status || t.status === status;
          return matchesQuery && matchesStatus;
        }).slice(0, 10);
      }

      if (types.includes("updates")) {
        const allUpdates = await storage.getUpdates(householdId);
        results.updates = allUpdates.filter(u => 
          u.text.toLowerCase().includes(query)
        ).slice(0, 10);
      }

      if (types.includes("vendors")) {
        const allVendors = await storage.getVendors(householdId);
        results.vendors = allVendors.filter(v => 
          v.name.toLowerCase().includes(query) ||
          (v.notes?.toLowerCase().includes(query)) ||
          (v.category?.toLowerCase().includes(query))
        ).slice(0, 10);
      }

      if (types.includes("preferences")) {
        const allPreferences = await storage.getPreferences(householdId);
        results.preferences = allPreferences.filter(p => 
          p.key.toLowerCase().includes(query) ||
          p.value.toLowerCase().includes(query)
        ).slice(0, 10);
      }

      results.totalCount = results.tasks.length + results.updates.length + 
                          results.vendors.length + results.preferences.length;

      res.json(results);
    } catch (error) {
      logger.error("Error searching", { error, userId, householdId });
      res.status(500).json({ message: "Failed to search" });
    }
  });

  // ============================================
  // ADMIN ROUTES (Assistant only)
  // ============================================

  // Export all data as JSON
  app.get("/api/admin/export", isAuthenticated, householdContext, requirePermission("CAN_ADMIN_EXPORTS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can export data" });
      }

      const data = await exportAllData();
      res.json({
        exportedAt: new Date().toISOString(),
        data,
      });
    } catch (error) {
      logger.error("Error exporting data", { error, userId });
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  app.post("/api/admin/sync-calendars", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can trigger sync" });
      }

      const result = await triggerImmediateSync();
      
      res.json({
        message: "Calendar sync triggered",
        ...result,
      });
    } catch (error: any) {
      logger.error("Error triggering sync", { error, userId });
      res.status(500).json({ message: "Failed to trigger sync" });
    }
  });

  // Create a backup ZIP
  app.post("/api/admin/backup", criticalLimiter, isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create backups" });
      }

      const backupPath = await createBackupZip(false);
      const filename = basename(backupPath);
      
      res.json({
        message: "Backup created successfully",
        filename,
        downloadUrl: `/api/admin/backups/${filename}/download`,
      });
    } catch (error) {
      logger.error("Error creating backup", { error, userId });
      res.status(500).json({ message: "Failed to create backup" });
    }
  });

  // List all backups
  app.get("/api/admin/backups", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view backups" });
      }

      const backups = listBackups();
      res.json(backups);
    } catch (error) {
      logger.error("Error listing backups", { error, userId });
      res.status(500).json({ message: "Failed to list backups" });
    }
  });

  // Download a backup
  app.get("/api/admin/backups/:filename/download", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can download backups" });
      }

      const filepath = getBackupPath(req.params.filename);
      if (!filepath) {
        return res.status(404).json({ message: "Backup not found" });
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
      createReadStream(filepath).pipe(res);
    } catch (error) {
      logger.error("Error downloading backup", { error, userId, filename: req.params.filename });
      res.status(500).json({ message: "Failed to download backup" });
    }
  });

  // Delete a backup
  app.delete("/api/admin/backups/:filename", criticalLimiter, isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can delete backups" });
      }

      const success = deleteBackup(req.params.filename);
      if (!success) {
        return res.status(404).json({ message: "Backup not found" });
      }

      res.json({ message: "Backup deleted successfully" });
    } catch (error) {
      logger.error("Error deleting backup", { error, userId, filename: req.params.filename });
      res.status(500).json({ message: "Failed to delete backup" });
    }
  });

  // Migrate existing vault items to encrypted storage
  app.post("/api/admin/migrate-vault-encryption", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const accessItems = await storage.getAccessItems(householdId);
      
      let migratedCount = 0;
      let skippedCount = 0;
      
      for (const item of accessItems) {
        if (item.isEncrypted || !item.isSensitive) {
          skippedCount++;
          continue;
        }
        
        try {
          const encryptedValue = encryptVaultValue(item.value);
          await storage.updateAccessItem(householdId, item.id, {
            value: encryptedValue,
            isEncrypted: true,
          });
          migratedCount++;
        } catch (error) {
          logger.error("Failed to migrate vault item", { error, itemId: item.id, householdId });
        }
      }
      
      res.json({
        success: true,
        message: `Migration complete. ${migratedCount} items encrypted, ${skippedCount} skipped.`,
        migratedCount,
        skippedCount,
      });
    } catch (error) {
      logger.error("Error migrating vault encryption", { error, householdId });
      res.status(500).json({ message: "Failed to migrate vault encryption" });
    }
  });

  // Get backup settings
  app.get("/api/admin/backup-settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view backup settings" });
      }

      const settings = getBackupSettings();
      res.json(settings);
    } catch (error) {
      logger.error("Error getting backup settings", { error, userId });
      res.status(500).json({ message: "Failed to get backup settings" });
    }
  });

  // Update backup settings
  app.patch("/api/admin/backup-settings", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_BACKUPS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update backup settings" });
      }

      const settings = saveBackupSettings(req.body);
      restartScheduledBackups();
      
      res.json(settings);
    } catch (error) {
      logger.error("Error updating backup settings", { error, userId });
      res.status(500).json({ message: "Failed to update backup settings" });
    }
  });

  // ============================================================
  // Organization Management Routes (Multi-tenancy foundation)
  // ============================================================
  
  // Get current user's organization
  app.get("/api/organizations/mine", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganizationByOwner(userId);
      
      if (!org) {
        return res.status(404).json({ message: "No organization found" });
      }
      
      res.json(org);
    } catch (error) {
      logger.error("Error getting organization", { error, userId });
      res.status(500).json({ message: "Failed to get organization" });
    }
  });

  // Get all organizations owned by current user
  app.get("/api/organizations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const orgs = await storage.getOrganizationsByOwner(userId);
      res.json(orgs);
    } catch (error) {
      logger.error("Error getting organizations", { error, userId });
      res.status(500).json({ message: "Failed to get organizations" });
    }
  });

  // Get organization by ID
  app.get("/api/organizations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Only owner can view their organization details
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(org);
    } catch (error) {
      logger.error("Error getting organization", { error, userId, organizationId: req.params.id });
      res.status(500).json({ message: "Failed to get organization" });
    }
  });

  // Create a new organization (for assistants managing multiple households)
  app.post("/api/organizations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      // Only assistants can create organizations
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create organizations" });
      }

      const validatedData = insertOrganizationSchema.parse({
        ...req.body,
        ownerId: userId,
      });
      
      const org = await storage.createOrganization(validatedData);
      res.status(201).json(org);
    } catch (error) {
      logger.error("Error creating organization", { error, userId });
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  // Update organization
  app.patch("/api/organizations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Only owner can update their organization
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedOrg = await storage.updateOrganization(req.params.id, req.body);
      res.json(updatedOrg);
    } catch (error) {
      logger.error("Error updating organization", { error, userId, organizationId: req.params.id });
      res.status(500).json({ message: "Failed to update organization" });
    }
  });

  // Get households within an organization
  app.get("/api/organizations/:id/households", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Only owner can view households in their organization
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const householdsData = await storage.getHouseholdsByOrganization(req.params.id);
      res.json(householdsData);
    } catch (error) {
      logger.error("Error getting organization households", { error, userId, organizationId: req.params.id });
      res.status(500).json({ message: "Failed to get organization households" });
    }
  });

  // Create household within an organization
  app.post("/api/organizations/:id/households", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create households" });
      }

      const org = await storage.getOrganization(req.params.id);
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      if (org.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const validatedData = insertHouseholdSchema.parse({
        ...req.body,
        organizationId: req.params.id,
      });
      
      const household = await storage.createHousehold(validatedData);
      res.status(201).json(household);
    } catch (error) {
      logger.error("Error creating household", { error, userId, organizationId: req.params.id });
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create household" });
    }
  });

  // Link existing household to organization
  app.patch("/api/households/:id/organization", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can link households" });
      }

      const { organizationId } = req.body;
      
      if (organizationId) {
        const org = await storage.getOrganization(organizationId);
        if (!org || org.ownerId !== userId) {
          return res.status(403).json({ message: "Invalid organization" });
        }
      }

      const household = await storage.updateHousehold(req.params.id, { organizationId });
      res.json(household);
    } catch (error) {
      logger.error("Error linking household", { error, userId, householdId: req.params.id });
      res.status(500).json({ message: "Failed to link household to organization" });
    }
  });

  // ============================================
  // BILLING ROUTES (Phase 1)
  // ============================================

  app.get("/api/billing/plans", async (_req, res) => {
    const { SUBSCRIPTION_PLANS, isDemoMode } = await import("./services/billing");
    res.json({
      plans: SUBSCRIPTION_PLANS,
      demoMode: isDemoMode(),
    });
  });

  app.get("/api/billing/subscription", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (!profile?.organizationId) {
        const { isDemoMode } = await import("./services/billing");
        return res.json({
          plan: "FREE",
          status: "ACTIVE",
          demoMode: isDemoMode(),
        });
      }

      const { getSubscription } = await import("./services/billing");
      const subscription = await getSubscription(profile.organizationId);
      res.json(subscription);
    } catch (error) {
      logger.error("Error fetching subscription", { error, userId });
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.post("/api/billing/checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage billing" });
      }

      if (!profile?.organizationId) {
        return res.status(400).json({ message: "Organization required for billing" });
      }

      const { planId, successUrl, cancelUrl } = req.body;
      const { createCheckoutSession } = await import("./services/billing");
      
      const session = await createCheckoutSession(
        profile.organizationId,
        planId,
        successUrl || `${req.headers.origin}/billing?success=true`,
        cancelUrl || `${req.headers.origin}/billing?canceled=true`
      );

      res.json(session);
    } catch (error) {
      logger.error("Error creating checkout", { error, userId });
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.post("/api/billing/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage billing" });
      }

      if (!profile?.organizationId) {
        return res.status(400).json({ message: "Organization required" });
      }

      const { createBillingPortalSession } = await import("./services/billing");
      const session = await createBillingPortalSession(
        profile.organizationId,
        req.body.returnUrl || `${req.headers.origin}/billing`
      );

      res.json(session);
    } catch (error) {
      logger.error("Error creating portal session", { error, userId });
      res.status(500).json({ message: "Failed to create billing portal" });
    }
  });

  app.get("/api/billing/invoices", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await getUserProfile(userId);
      
      if (!profile?.organizationId) {
        return res.json([]);
      }

      const { getInvoices } = await import("./services/billing");
      const invoiceList = await getInvoices(profile.organizationId);
      res.json(invoiceList);
    } catch (error) {
      logger.error("Error fetching invoices", { error, userId });
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/billing/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      const { handleStripeWebhook } = await import("./services/billing");
      const result = await handleStripeWebhook(req.body, signature);
      
      if (result.isServerError) {
        return res.status(500).json({ message: result.error, received: false });
      }
      
      res.json(result);
    } catch (error) {
      logger.error("Webhook error", { error });
      res.status(500).json({ message: "Webhook handler failed" });
    }
  });

  // ============================================
  // ANALYTICS ROUTES (Phase 1 - PRO Feature)
  // ============================================

  app.get("/api/analytics/dashboard", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Analytics available for assistants only" });
      }

      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getAnalyticsDashboard } = await import("./services/analytics");
      const dashboard = await getAnalyticsDashboard(householdId, period);
      res.json(dashboard);
    } catch (error) {
      logger.error("Error fetching analytics", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/tasks-over-time", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Analytics available for assistants only" });
      }

      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getTasksOverTime } = await import("./services/analytics");
      const data = await getTasksOverTime(householdId, period);
      res.json(data);
    } catch (error) {
      logger.error("Error fetching tasks over time", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/tasks-by-category", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getTasksByCategory } = await import("./services/analytics");
      const data = await getTasksByCategory(householdId, period);
      res.json(data);
    } catch (error) {
      logger.error("Error fetching tasks by category", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/client-summary", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const { generateClientImpactSummary } = await import("./services/analytics");
      const summary = await generateClientImpactSummary(householdId);
      res.json(summary);
    } catch (error) {
      logger.error("Error generating client summary", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  app.get("/api/analytics/stats", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getDashboardStats } = await import("./services/analytics");
      const stats = await getDashboardStats(householdId, period);
      res.json(stats);
    } catch (error) {
      logger.error("Error fetching analytics stats", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/task-breakdown", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getTaskBreakdown } = await import("./services/analytics");
      const breakdown = await getTaskBreakdown(householdId, period);
      res.json(breakdown);
    } catch (error) {
      logger.error("Error fetching task breakdown", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/spending-breakdown", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getSpendingBreakdown } = await import("./services/analytics");
      const breakdown = await getSpendingBreakdown(householdId, period);
      res.json(breakdown);
    } catch (error) {
      logger.error("Error fetching spending breakdown", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/timeline", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getTimelineData } = await import("./services/analytics");
      const timeline = await getTimelineData(householdId, period);
      res.json(timeline);
    } catch (error) {
      logger.error("Error fetching timeline", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/performance", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getAssistantPerformance } = await import("./services/analytics");
      const performance = await getAssistantPerformance(householdId, period);
      res.json(performance);
    } catch (error) {
      logger.error("Error fetching performance", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ============================================
  // EMERGENCY CONTACTS & PROTOCOLS (Phase 1)
  // ============================================

  app.get("/api/emergency/contacts", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const contacts = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.householdId, householdId));
      res.json(contacts);
    } catch (error) {
      logger.error("Error fetching emergency contacts", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/emergency/contacts", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage contacts" });
      }

      const [contact] = await db.insert(emergencyContacts)
        .values({ ...req.body, householdId })
        .returning();
      res.status(201).json(contact);
    } catch (error) {
      logger.error("Error creating emergency contact", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.patch("/api/emergency/contacts/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage contacts" });
      }

      const [existing] = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.id, req.params.id));
      
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const [updated] = await db.update(emergencyContacts)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(emergencyContacts.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      logger.error("Error updating emergency contact", { error, userId, householdId, contactId: req.params.id });
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.delete("/api/emergency/contacts/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage contacts" });
      }

      const [existing] = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.id, req.params.id));
      
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Contact not found" });
      }

      await db.delete(emergencyContacts).where(eq(emergencyContacts.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting emergency contact", { error, userId, householdId, contactId: req.params.id });
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  app.get("/api/emergency/protocols", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const protocols = await db.select().from(emergencyProtocols)
        .where(eq(emergencyProtocols.householdId, householdId));
      res.json(protocols);
    } catch (error) {
      logger.error("Error fetching protocols", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch protocols" });
    }
  });

  app.post("/api/emergency/protocols", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage protocols" });
      }

      const [protocol] = await db.insert(emergencyProtocols)
        .values({ ...req.body, householdId })
        .returning();
      res.status(201).json(protocol);
    } catch (error) {
      logger.error("Error creating protocol", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create protocol" });
    }
  });

  // ============================================
  // IN-APP MESSAGING ROUTES (Phase 1 - Premium)
  // ============================================

  app.get("/api/conversations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const convos = await db.select().from(conversations)
        .where(eq(conversations.householdId, householdId))
        .orderBy(conversations.lastMessageAt);
      res.json(convos.reverse());
    } catch (error) {
      logger.error("Error fetching conversations", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { type, title, participantIds } = req.body;

      const [convo] = await db.insert(conversations)
        .values({ 
          householdId, 
          type: type || "CLIENT_ASSISTANT",
          title,
          participantIds: participantIds || [userId],
        })
        .returning();
      res.status(201).json(convo);
    } catch (error) {
      logger.error("Error creating conversation", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const conversationId = req.params.id;
      
      const [convo] = await db.select().from(conversations)
        .where(eq(conversations.id, conversationId));
      
      if (!convo || convo.householdId !== householdId) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const msgs = await db.select().from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);
      res.json(msgs);
    } catch (error) {
      logger.error("Error fetching messages", { error, userId, householdId, conversationId });
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const conversationId = req.params.id;
      const { text, attachments, isVoice, voiceTranscription } = req.body;

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ message: "Message text is required" });
      }

      if (text.length > 10000) {
        return res.status(400).json({ message: "Message too long" });
      }

      const [convo] = await db.select().from(conversations)
        .where(eq(conversations.id, conversationId));
      
      if (!convo || convo.householdId !== householdId) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const [msg] = await db.insert(messages)
        .values({
          conversationId,
          senderId: userId,
          text,
          attachments: attachments || [],
          isVoice: isVoice || false,
          voiceTranscription,
          readBy: [userId],
        })
        .returning();

      await db.update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, conversationId));

      res.status(201).json(msg);
    } catch (error) {
      logger.error("Error sending message", { error, userId, householdId, conversationId });
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.patch("/api/messages/:id/read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const messageId = req.params.id;

      // First get the message
      const [msg] = await db.select().from(messages)
        .where(eq(messages.id, messageId));
      
      if (!msg) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Verify the conversation belongs to the user's household
      const [convo] = await db.select().from(conversations)
        .where(and(
          eq(conversations.id, msg.conversationId),
          eq(conversations.householdId, householdId)
        ));
      
      if (!convo) {
        return res.status(404).json({ message: "Message not found" });
      }

      const readBy = msg.readBy || [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await db.update(messages)
          .set({ readBy })
          .where(eq(messages.id, messageId));
      }

      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking message read", { error, userId, householdId, messageId });
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // ============================================
  // AI ASSISTANT ROUTES (Phase 1 - Premium)
  // ============================================

  app.get("/api/ai/status", isAuthenticated, async (_req, res) => {
    const { isDemoMode, getActiveProvider } = await import("./services/ai-provider");
    res.json({
      available: !isDemoMode(),
      provider: getActiveProvider(),
      demoMode: isDemoMode(),
    });
  });

  app.post("/api/ai/parse-request", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text required" });
      }

      const { parseRequest } = await import("./services/ai-provider");
      const parsed = await parseRequest(text);
      res.json(parsed);
    } catch (error) {
      logger.error("Error parsing request", { error });
      res.status(500).json({ message: "Failed to parse request" });
    }
  });

  app.get("/api/ai/weekly-brief", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const events = await storage.getCalendarEvents(householdId);
      const tasksList = await storage.getTasks(householdId);
      const importantDates = await storage.getImportantDates(householdId);
      
      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const upcomingEvents = events.filter((e) => 
        e.startAt && e.startAt >= now && e.startAt <= weekEnd
      );
      
      const upcomingTasks = tasksList.filter((t) => t.status !== "DONE");
      
      const upcomingBirthdays = importantDates
        .filter((d) => d.type === "BIRTHDAY")
        .map((d) => ({ name: d.title, date: d.date }));

      try {
        const { generateWeeklyBrief } = await import("./services/ai-provider");
        const brief = await generateWeeklyBrief({
          events: upcomingEvents.map((e) => ({ title: e.title, startAt: e.startAt! })),
          tasks: upcomingTasks.map((t) => ({
            title: t.title,
            category: t.category,
            dueAt: t.dueAt,
          })),
          birthdays: upcomingBirthdays,
        });
        res.json({ brief });
      } catch (aiError) {
        logger.error("AI brief generation failed, using fallback", { error: aiError, userId, householdId });
        const parts: string[] = [];
        if (upcomingEvents.length > 0) parts.push(`${upcomingEvents.length} event${upcomingEvents.length > 1 ? "s" : ""}`);
        if (upcomingTasks.length > 0) parts.push(`${upcomingTasks.length} task${upcomingTasks.length > 1 ? "s" : ""}`);
        if (upcomingBirthdays.length > 0) parts.push(`${upcomingBirthdays.length} birthday${upcomingBirthdays.length > 1 ? "s" : ""}`);
        const fallbackBrief = `This week: ${parts.length > 0 ? parts.join(", ") : "looking calm and clear"}.`;
        res.json({ brief: fallbackBrief, fallback: true });
      }
    } catch (error) {
      logger.error("Error generating brief", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate brief" });
    }
  });

  app.post("/api/ai/transcribe", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { audioBase64 } = req.body;
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return res.status(400).json({ message: "Audio data required" });
      }

      const { transcribeVoice } = await import("./services/ai-provider");
      const transcription = await transcribeVoice(audioBase64);
      res.json({ transcription });
    } catch (error) {
      logger.error("Error transcribing voice", { error });
      res.status(500).json({ message: "Failed to transcribe voice" });
    }
  });

  app.post("/api/ai/smart-actions", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;

      const tasksList = await storage.getTasks(householdId);
      const vendors = await storage.getVendors(householdId);
      const importantDates = await storage.getImportantDates(householdId);

      const recentTasks = tasksList.slice(0, 5).map((t) => t.title);
      const upcomingDates = importantDates.slice(0, 3).map((d) => d.title);

      const { suggestSmartActions } = await import("./services/ai-provider");
      const suggestions = await suggestSmartActions({
        recentTasks,
        upcomingDates,
      });

      res.json({ suggestions });
    } catch (error) {
      logger.error("Error getting smart actions", { error, userId, householdId });
      res.status(500).json({ message: "Failed to get suggestions" });
    }
  });

  app.post("/api/ai/chat", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "Messages array required" });
      }

      const { chat } = await import("./services/ai-chat");
      const result = await chat(messages, householdId);
      res.json(result);
    } catch (error) {
      logger.error("Error in AI chat", { error, householdId });
      res.status(500).json({ message: "Failed to process chat" });
    }
  });

  app.post("/api/ai/chat/create-request", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { title, description, category, urgency } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const requestData = {
        title,
        description: description || null,
        category: category || "OTHER",
        urgency: urgency || "MEDIUM",
        createdBy: userId,
        householdId,
      };

      const request = await storage.createRequest(requestData);
      
      wsManager.broadcast("request:created", { id: request.id, title: request.title }, householdId, userId);
      
      res.status(201).json({ 
        success: true, 
        request,
        message: `I've submitted your request for "${title}". Your assistant will see it right away!`
      });
    } catch (error) {
      logger.error("Error creating request from chat", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create request" });
    }
  });

  app.post("/api/ai/parse-smart", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { text, useAI = true } = req.body;

      if (!text || text.length < 3) {
        return res.status(400).json({ message: "Request text too short" });
      }

      const { parseNaturalLanguageRequest, quickParseRequest } = await import("./services/ai-chat");
      
      if (!useAI) {
        const result = quickParseRequest(text);
        return res.json({ ...result, usedAI: false });
      }

      const [people, locations] = await Promise.all([
        storage.getPeople(householdId),
        storage.getHouseholdLocations(householdId),
      ]);

      const result = await parseNaturalLanguageRequest(text, {
        familyMembers: people.map(p => p.preferredName || p.fullName),
        frequentLocations: locations.map(l => l.name),
      });

      res.json({ ...result, usedAI: true });
    } catch (error) {
      logger.error("Error parsing smart request", { error, householdId });
      res.status(500).json({ message: "Failed to parse request" });
    }
  });

  // Proactive AI Insights endpoints
  app.get("/api/ai/insights", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { getProactiveInsights } = await import("./services/ai-agent");
      
      const insights = await getProactiveInsights(householdId);
      res.json({ insights });
    } catch (error) {
      logger.error("Error fetching proactive insights", { error, householdId });
      res.status(500).json({ message: "Failed to fetch insights" });
    }
  });

  app.post("/api/ai/insights/refresh", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { gatherHouseholdContext, generateProactiveInsights } = await import("./services/ai-agent");
      
      const context = await gatherHouseholdContext(householdId);
      const insights = await generateProactiveInsights(context);
      
      res.json({ insights, generated: insights.length });
    } catch (error) {
      logger.error("Error generating insights", { error, householdId });
      res.status(500).json({ message: "Failed to generate insights" });
    }
  });

  app.post("/api/ai/insights/:id/dismiss", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { dismissInsight } = await import("./services/ai-agent");
      
      await dismissInsight(id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error dismissing insight", { error, insightId: req.params.id });
      res.status(500).json({ message: "Failed to dismiss insight" });
    }
  });

  app.get("/api/ai/estimate-duration", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { category } = req.query;
      
      if (!category) {
        return res.status(400).json({ message: "Category required" });
      }
      
      const { getSmartEstimate } = await import("./services/ai-agent");
      const estimate = await getSmartEstimate(householdId, category as string);
      
      res.json(estimate);
    } catch (error) {
      logger.error("Error getting estimate", { error, householdId });
      res.status(500).json({ message: "Failed to get estimate" });
    }
  });

  app.post("/api/ai/learn/task-complete", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { taskId, category, estimatedMinutes, createdAt, completedAt } = req.body;
      
      if (!taskId || !category || !createdAt || !completedAt) {
        return res.status(400).json({ 
          message: "Missing required fields: taskId, category, createdAt, and completedAt are required" 
        });
      }
      
      const parsedCreatedAt = new Date(createdAt);
      const parsedCompletedAt = new Date(completedAt);
      
      if (isNaN(parsedCreatedAt.getTime()) || isNaN(parsedCompletedAt.getTime())) {
        return res.status(400).json({ message: "Invalid date format for createdAt or completedAt" });
      }
      
      const { recordTaskCompletion } = await import("./services/ai-agent");
      
      await recordTaskCompletion({
        id: taskId,
        householdId,
        category,
        estimatedMinutes: estimatedMinutes || null,
        createdAt: parsedCreatedAt,
        completedAt: parsedCompletedAt,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error recording task completion", { error, householdId });
      res.status(500).json({ message: "Failed to record completion" });
    }
  });

  return httpServer;
}
