import { storage } from "../storage";
import logger from "../lib/logger";
import { addDays, addWeeks, addMonths, setHours, setMinutes, format, getMonth, getDate, subDays, isBefore, isAfter, setYear } from "date-fns";

export function calculateNextOccurrence(
  recurrence: string,
  customDays: number | null | undefined,
  currentDueAt: Date | null | undefined
): Date | null {
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

export async function getOrCreateHousehold(userId: string): Promise<string> {
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

export async function seedDemoData(householdId: string, userId: string) {
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
  
  const doneTaskId = createdTaskIds[4];
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

export async function generateMomentsTasks(householdId: string): Promise<number> {
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

export async function runMomentsAutomation(): Promise<void> {
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
