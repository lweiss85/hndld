import { 
  organizations, households, tasks, taskChecklistItems, taskTemplates, approvals, updates, requests,
  comments, vendors, spendingItems, calendarEvents, userProfiles, reactions,
  householdSettings, householdLocations, people, preferences, importantDates, accessItems,
  quickRequestTemplates, playbooks, playbookSteps, vaultSettings, users,
  organizationPaymentProfiles, householdPaymentOverrides,
  type Organization, type InsertOrganization,
  type Household, type InsertHousehold,
  type Task, type InsertTask,
  type TaskChecklistItem, type InsertTaskChecklistItem,
  type TaskTemplate, type InsertTaskTemplate,
  type Approval, type InsertApproval,
  type Update, type InsertUpdate,
  type Request, type InsertRequest,
  type Comment, type InsertComment,
  type Reaction, type InsertReaction,
  type Vendor, type InsertVendor,
  type SpendingItem, type InsertSpendingItem,
  type CalendarEvent, type InsertCalendarEvent,
  type UserProfile, type InsertUserProfile,
  type HouseholdSettings, type InsertHouseholdSettings,
  type HouseholdLocation, type InsertHouseholdLocation,
  type Person, type InsertPerson,
  type Preference, type InsertPreference,
  type ImportantDate, type InsertImportantDate,
  type AccessItem, type InsertAccessItem,
  type QuickRequestTemplate, type InsertQuickRequestTemplate,
  type Playbook, type InsertPlaybook,
  type PlaybookStep, type InsertPlaybookStep,
  type VaultSettings, type InsertVaultSettings,
  type User,
  type OrganizationPaymentProfile, type InsertOrganizationPaymentProfile,
  type HouseholdPaymentOverride, type InsertHouseholdPaymentOverride,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, inArray, notInArray, sql } from "drizzle-orm";
import { startOfWeek, endOfWeek, addDays } from "date-fns";

export interface IStorage {
  // Organizations
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationByOwner(ownerId: string): Promise<Organization | undefined>;
  getOrganizationsByOwner(ownerId: string): Promise<Organization[]>;
  createOrganization(data: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined>;
  
  // Households
  getHousehold(id: string): Promise<Household | undefined>;
  getAllHouseholds(): Promise<Household[]>;
  getHouseholdsByOrganization(organizationId: string): Promise<Household[]>;
  createHousehold(data: InsertHousehold): Promise<Household>;
  updateHousehold(id: string, data: Partial<InsertHousehold>): Promise<Household | undefined>;
  
  // User Profiles
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  getUserProfileForHousehold(userId: string, householdId: string): Promise<UserProfile | undefined>;
  getUserProfilesByUserId(userId: string): Promise<UserProfile[]>;
  createUserProfile(data: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(id: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  getHouseholdByUserId(userId: string): Promise<string | undefined>;
  getHouseholdById(householdId: string): Promise<Household | undefined>;
  getHouseholdAssistants(householdId: string): Promise<UserProfile[]>;
  
  // Users (from auth)
  getUser(userId: string): Promise<User | undefined>;
  
  // Tasks (household-scoped)
  getTasks(householdId: string): Promise<Task[]>;
  getTask(householdId: string, id: string): Promise<Task | undefined>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(householdId: string, id: string, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(householdId: string, id: string): Promise<boolean>;
  
  // Task Checklist Items (scoped via task)
  getTaskChecklistItems(taskId: string): Promise<TaskChecklistItem[]>;
  createTaskChecklistItem(data: InsertTaskChecklistItem): Promise<TaskChecklistItem>;
  updateTaskChecklistItem(householdId: string, taskId: string, id: string, data: Partial<InsertTaskChecklistItem>): Promise<TaskChecklistItem | undefined>;
  deleteTaskChecklistItem(householdId: string, taskId: string, id: string): Promise<boolean>;
  
  // Task Templates (household-scoped)
  getTaskTemplates(householdId: string): Promise<TaskTemplate[]>;
  getTaskTemplate(householdId: string, id: string): Promise<TaskTemplate | undefined>;
  createTaskTemplate(data: InsertTaskTemplate): Promise<TaskTemplate>;
  updateTaskTemplate(householdId: string, id: string, data: Partial<InsertTaskTemplate>): Promise<TaskTemplate | undefined>;
  deleteTaskTemplate(householdId: string, id: string): Promise<boolean>;
  
  // Approvals (household-scoped)
  getApprovals(householdId: string): Promise<Approval[]>;
  getApproval(householdId: string, id: string): Promise<Approval | undefined>;
  createApproval(data: InsertApproval): Promise<Approval>;
  updateApproval(householdId: string, id: string, data: Partial<InsertApproval>): Promise<Approval | undefined>;
  
  // Updates (household-scoped)
  getUpdates(householdId: string): Promise<Update[]>;
  getUpdate(householdId: string, id: string): Promise<Update | undefined>;
  createUpdate(data: InsertUpdate): Promise<Update>;
  updateUpdate(householdId: string, id: string, data: Partial<InsertUpdate>): Promise<Update | undefined>;
  
  // Requests (household-scoped)
  getRequests(householdId: string): Promise<Request[]>;
  getRequest(householdId: string, id: string): Promise<Request | undefined>;
  createRequest(data: InsertRequest): Promise<Request>;
  updateRequest(householdId: string, id: string, data: Partial<InsertRequest>): Promise<Request | undefined>;
  
  // Comments
  getComments(entityType: string, entityId: string): Promise<Comment[]>;
  createComment(data: InsertComment): Promise<Comment>;
  
  // Vendors (household-scoped)
  getVendors(householdId: string): Promise<Vendor[]>;
  getVendor(householdId: string, id: string): Promise<Vendor | undefined>;
  createVendor(data: InsertVendor): Promise<Vendor>;
  updateVendor(householdId: string, id: string, data: Partial<InsertVendor>): Promise<Vendor | undefined>;
  deleteVendor(householdId: string, id: string): Promise<boolean>;
  
  // Spending (household-scoped)
  getSpending(householdId: string): Promise<SpendingItem[]>;
  getSpendingItem(householdId: string, id: string): Promise<SpendingItem | undefined>;
  createSpendingItem(data: InsertSpendingItem): Promise<SpendingItem>;
  updateSpendingItem(householdId: string, id: string, data: Partial<InsertSpendingItem>): Promise<SpendingItem | undefined>;
  deleteSpendingItem(householdId: string, id: string): Promise<boolean>;
  
  // Calendar Events (household-scoped)
  getCalendarEvents(householdId: string): Promise<CalendarEvent[]>;
  getCalendarEvent(householdId: string, id: string): Promise<CalendarEvent | undefined>;
  getCalendarEventByProviderId(householdId: string, providerEventId: string): Promise<CalendarEvent | undefined>;
  createCalendarEvent(data: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(householdId: string, id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(householdId: string, id: string): Promise<boolean>;
  deleteCalendarEventsNotIn(householdId: string, providerEventIds: string[]): Promise<number>;
  
  // Reactions
  getReactions(entityType: string, entityIds: string[], householdId: string): Promise<Reaction[]>;
  getReaction(entityType: string, entityId: string, userId: string): Promise<Reaction | undefined>;
  upsertReaction(data: InsertReaction): Promise<Reaction>;
  deleteReaction(entityType: string, entityId: string, userId: string, householdId: string): Promise<void>;
  
  // Household Settings
  getHouseholdSettings(householdId: string): Promise<HouseholdSettings | undefined>;
  upsertHouseholdSettings(householdId: string, data: Partial<InsertHouseholdSettings>): Promise<HouseholdSettings>;
  
  // Household Locations (household-scoped)
  getHouseholdLocations(householdId: string): Promise<HouseholdLocation[]>;
  getHouseholdLocation(householdId: string, id: string): Promise<HouseholdLocation | undefined>;
  createHouseholdLocation(data: InsertHouseholdLocation): Promise<HouseholdLocation>;
  updateHouseholdLocation(householdId: string, id: string, data: Partial<InsertHouseholdLocation>): Promise<HouseholdLocation | undefined>;
  deleteHouseholdLocation(householdId: string, id: string): Promise<boolean>;
  
  // People (household-scoped)
  getPeople(householdId: string): Promise<Person[]>;
  getPerson(householdId: string, id: string): Promise<Person | undefined>;
  createPerson(data: InsertPerson): Promise<Person>;
  updatePerson(householdId: string, id: string, data: Partial<InsertPerson>): Promise<Person | undefined>;
  deletePerson(householdId: string, id: string): Promise<boolean>;
  
  // Preferences (household-scoped)
  getPreferences(householdId: string): Promise<Preference[]>;
  getPreference(householdId: string, id: string): Promise<Preference | undefined>;
  createPreference(data: InsertPreference): Promise<Preference>;
  updatePreference(householdId: string, id: string, data: Partial<InsertPreference>): Promise<Preference | undefined>;
  deletePreference(householdId: string, id: string): Promise<boolean>;
  
  // Important Dates (household-scoped)
  getImportantDates(householdId: string): Promise<ImportantDate[]>;
  getImportantDate(householdId: string, id: string): Promise<ImportantDate | undefined>;
  createImportantDate(data: InsertImportantDate): Promise<ImportantDate>;
  updateImportantDate(householdId: string, id: string, data: Partial<InsertImportantDate>): Promise<ImportantDate | undefined>;
  deleteImportantDate(householdId: string, id: string): Promise<boolean>;
  
  // Access Items (household-scoped)
  getAccessItems(householdId: string): Promise<AccessItem[]>;
  getAccessItem(householdId: string, id: string): Promise<AccessItem | undefined>;
  createAccessItem(data: InsertAccessItem): Promise<AccessItem>;
  updateAccessItem(householdId: string, id: string, data: Partial<InsertAccessItem>): Promise<AccessItem | undefined>;
  deleteAccessItem(householdId: string, id: string): Promise<boolean>;
  
  // Quick Request Templates (household-scoped)
  getQuickRequestTemplates(householdId: string): Promise<QuickRequestTemplate[]>;
  getQuickRequestTemplate(householdId: string, id: string): Promise<QuickRequestTemplate | undefined>;
  createQuickRequestTemplate(data: InsertQuickRequestTemplate): Promise<QuickRequestTemplate>;
  updateQuickRequestTemplate(householdId: string, id: string, data: Partial<InsertQuickRequestTemplate>): Promise<QuickRequestTemplate | undefined>;
  deleteQuickRequestTemplate(householdId: string, id: string): Promise<boolean>;
  
  // Playbooks (household-scoped)
  getPlaybooks(householdId: string): Promise<Playbook[]>;
  getPlaybook(householdId: string, id: string): Promise<Playbook | undefined>;
  createPlaybook(data: InsertPlaybook): Promise<Playbook>;
  updatePlaybook(householdId: string, id: string, data: Partial<InsertPlaybook>): Promise<Playbook | undefined>;
  deletePlaybook(householdId: string, id: string): Promise<boolean>;
  
  // Playbook Steps (scoped via playbook)
  getPlaybookSteps(playbookId: string): Promise<PlaybookStep[]>;
  createPlaybookStep(data: InsertPlaybookStep): Promise<PlaybookStep>;
  updatePlaybookStep(householdId: string, playbookId: string, id: string, data: Partial<InsertPlaybookStep>): Promise<PlaybookStep | undefined>;
  deletePlaybookStep(householdId: string, playbookId: string, id: string): Promise<boolean>;
  
  // Vault Settings
  getVaultSettings(householdId: string): Promise<VaultSettings | undefined>;
  upsertVaultSettings(householdId: string, data: Partial<InsertVaultSettings>): Promise<VaultSettings>;
  
  // Organization Payment Profiles
  getOrganizationPaymentProfile(organizationId: string): Promise<OrganizationPaymentProfile | undefined>;
  upsertOrganizationPaymentProfile(organizationId: string, data: Partial<InsertOrganizationPaymentProfile>): Promise<OrganizationPaymentProfile>;
  
  // Household Payment Overrides
  getHouseholdPaymentOverride(householdId: string): Promise<HouseholdPaymentOverride | undefined>;
  upsertHouseholdPaymentOverride(householdId: string, data: Partial<InsertHouseholdPaymentOverride>): Promise<HouseholdPaymentOverride>;
  
  // Multi-Household Support
  getUserHouseholds(userId: string): Promise<{ id: string; name: string; organizationId: string | null; isDefault: boolean; role: string }[]>;
  setDefaultHousehold(userId: string, householdId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Organizations
  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getOrganizationByOwner(ownerId: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.ownerId, ownerId));
    return org;
  }

  async getOrganizationsByOwner(ownerId: string): Promise<Organization[]> {
    return db.select().from(organizations).where(eq(organizations.ownerId, ownerId));
  }

  async createOrganization(data: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(data).returning();
    return org;
  }

  async updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [org] = await db.update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }

  // Households
  async getHousehold(id: string): Promise<Household | undefined> {
    const [household] = await db.select().from(households).where(eq(households.id, id));
    return household;
  }

  async getAllHouseholds(): Promise<Household[]> {
    return db.select().from(households);
  }

  async getHouseholdsByOrganization(organizationId: string): Promise<Household[]> {
    return db.select().from(households).where(eq(households.organizationId, organizationId));
  }

  async createHousehold(data: InsertHousehold): Promise<Household> {
    const [household] = await db.insert(households).values(data).returning();
    return household;
  }

  async updateHousehold(id: string, data: Partial<InsertHousehold>): Promise<Household | undefined> {
    const [household] = await db.update(households)
      .set(data)
      .where(eq(households.id, id))
      .returning();
    return household;
  }

  // User Profiles
  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async getUserProfileForHousehold(userId: string, householdId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(
      and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      )
    );
    return profile;
  }

  async getUserProfilesByUserId(userId: string): Promise<UserProfile[]> {
    return db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  }

  async createUserProfile(data: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db.insert(userProfiles).values(data).returning();
    return profile;
  }

  async updateUserProfile(id: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [profile] = await db.update(userProfiles)
      .set(data)
      .where(eq(userProfiles.id, id))
      .returning();
    return profile;
  }

  async getHouseholdByUserId(userId: string): Promise<string | undefined> {
    const profile = await this.getUserProfile(userId);
    return profile?.householdId || undefined;
  }

  async getHouseholdById(householdId: string): Promise<Household | undefined> {
    return this.getHousehold(householdId);
  }

  async getHouseholdAssistants(householdId: string): Promise<UserProfile[]> {
    return db.select().from(userProfiles).where(
      and(
        eq(userProfiles.householdId, householdId),
        eq(userProfiles.role, "ASSISTANT")
      )
    );
  }

  async getUser(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  // Tasks (household-scoped)
  async getTasks(householdId: string): Promise<Task[]> {
    return db.select().from(tasks)
      .where(eq(tasks.householdId, householdId))
      .orderBy(desc(tasks.createdAt));
  }

  async getTask(householdId: string, id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.householdId, householdId)));
    return task;
  }

  async createTask(data: InsertTask): Promise<Task> {
    const values = {
      ...data,
      images: data.images ? [...data.images] : undefined,
    };
    const [task] = await db.insert(tasks).values(values as any).returning();
    return task;
  }

  async updateTask(householdId: string, id: string, data: Partial<InsertTask>): Promise<Task | undefined> {
    const setData = {
      ...data,
      images: data.images ? [...data.images] : undefined,
      updatedAt: new Date(),
    };
    const [task] = await db.update(tasks)
      .set(setData as any)
      .where(and(eq(tasks.id, id), eq(tasks.householdId, householdId)))
      .returning();
    return task;
  }

  async deleteTask(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Task Checklist Items (scoped via task verification)
  async getTaskChecklistItems(taskId: string): Promise<TaskChecklistItem[]> {
    return db.select().from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.order);
  }

  async createTaskChecklistItem(data: InsertTaskChecklistItem): Promise<TaskChecklistItem> {
    const [item] = await db.insert(taskChecklistItems).values(data).returning();
    return item;
  }

  async updateTaskChecklistItem(householdId: string, taskId: string, id: string, data: Partial<InsertTaskChecklistItem>): Promise<TaskChecklistItem | undefined> {
    const task = await this.getTask(householdId, taskId);
    if (!task) return undefined;
    const [item] = await db.update(taskChecklistItems)
      .set(data)
      .where(and(eq(taskChecklistItems.id, id), eq(taskChecklistItems.taskId, taskId)))
      .returning();
    return item;
  }

  async deleteTaskChecklistItem(householdId: string, taskId: string, id: string): Promise<boolean> {
    const task = await this.getTask(householdId, taskId);
    if (!task) return false;
    const result = await db.delete(taskChecklistItems)
      .where(and(eq(taskChecklistItems.id, id), eq(taskChecklistItems.taskId, taskId)))
      .returning();
    return result.length > 0;
  }

  // Task Templates (household-scoped)
  async getTaskTemplates(householdId: string): Promise<TaskTemplate[]> {
    return await db.select().from(taskTemplates).where(eq(taskTemplates.householdId, householdId));
  }

  async getTaskTemplate(householdId: string, id: string): Promise<TaskTemplate | undefined> {
    const [template] = await db.select().from(taskTemplates)
      .where(and(eq(taskTemplates.id, id), eq(taskTemplates.householdId, householdId)));
    return template;
  }

  async createTaskTemplate(data: InsertTaskTemplate): Promise<TaskTemplate> {
    const values = {
      ...data,
      checklistItems: data.checklistItems ? [...data.checklistItems] : undefined,
    };
    const [template] = await db.insert(taskTemplates).values(values as any).returning();
    return template;
  }

  async updateTaskTemplate(householdId: string, id: string, data: Partial<InsertTaskTemplate>): Promise<TaskTemplate | undefined> {
    const setData = {
      ...data,
      checklistItems: data.checklistItems ? [...data.checklistItems] : undefined,
    };
    const [template] = await db.update(taskTemplates)
      .set(setData as any)
      .where(and(eq(taskTemplates.id, id), eq(taskTemplates.householdId, householdId)))
      .returning();
    return template;
  }

  async deleteTaskTemplate(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(taskTemplates)
      .where(and(eq(taskTemplates.id, id), eq(taskTemplates.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Approvals (household-scoped)
  async getApprovals(householdId: string): Promise<Approval[]> {
    return db.select().from(approvals)
      .where(eq(approvals.householdId, householdId))
      .orderBy(desc(approvals.createdAt));
  }

  async getApproval(householdId: string, id: string): Promise<Approval | undefined> {
    const [approval] = await db.select().from(approvals)
      .where(and(eq(approvals.id, id), eq(approvals.householdId, householdId)));
    return approval;
  }

  async createApproval(data: InsertApproval): Promise<Approval> {
    const values = {
      ...data,
      images: data.images ? [...data.images] : undefined,
      links: data.links ? [...data.links] : undefined,
    };
    const [approval] = await db.insert(approvals).values(values as any).returning();
    return approval;
  }

  async updateApproval(householdId: string, id: string, data: Partial<InsertApproval>): Promise<Approval | undefined> {
    const setData = {
      ...data,
      images: data.images ? [...data.images] : undefined,
      links: data.links ? [...data.links] : undefined,
      updatedAt: new Date(),
    };
    const [approval] = await db.update(approvals)
      .set(setData as any)
      .where(and(eq(approvals.id, id), eq(approvals.householdId, householdId)))
      .returning();
    return approval;
  }

  // Updates (household-scoped)
  async getUpdates(householdId: string): Promise<Update[]> {
    return db.select().from(updates)
      .where(eq(updates.householdId, householdId))
      .orderBy(desc(updates.createdAt));
  }

  async getUpdate(householdId: string, id: string): Promise<Update | undefined> {
    const [update] = await db.select().from(updates)
      .where(and(eq(updates.id, id), eq(updates.householdId, householdId)));
    return update;
  }

  async createUpdate(data: InsertUpdate): Promise<Update> {
    const [update] = await db.insert(updates).values(data as any).returning();
    return update;
  }

  async updateUpdate(householdId: string, id: string, data: Partial<InsertUpdate>): Promise<Update | undefined> {
    const [update] = await db.update(updates)
      .set(data as any)
      .where(and(eq(updates.id, id), eq(updates.householdId, householdId)))
      .returning();
    return update;
  }

  // Requests (household-scoped)
  async getRequests(householdId: string): Promise<Request[]> {
    return db.select().from(requests)
      .where(eq(requests.householdId, householdId))
      .orderBy(desc(requests.createdAt));
  }

  async getRequest(householdId: string, id: string): Promise<Request | undefined> {
    const [request] = await db.select().from(requests)
      .where(and(eq(requests.id, id), eq(requests.householdId, householdId)));
    return request;
  }

  async createRequest(data: InsertRequest): Promise<Request> {
    const [request] = await db.insert(requests).values(data as any).returning();
    return request;
  }

  async updateRequest(householdId: string, id: string, data: Partial<InsertRequest>): Promise<Request | undefined> {
    const [request] = await db.update(requests)
      .set(data as any)
      .where(and(eq(requests.id, id), eq(requests.householdId, householdId)))
      .returning();
    return request;
  }

  // Comments
  async getComments(entityType: string, entityId: string): Promise<Comment[]> {
    return db.select().from(comments)
      .where(and(
        eq(comments.entityType, entityType as any),
        eq(comments.entityId, entityId)
      ))
      .orderBy(comments.createdAt);
  }

  async createComment(data: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(data).returning();
    return comment;
  }

  // Vendors (household-scoped)
  async getVendors(householdId: string): Promise<Vendor[]> {
    return db.select().from(vendors)
      .where(eq(vendors.householdId, householdId))
      .orderBy(vendors.name);
  }

  async getVendor(householdId: string, id: string): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.householdId, householdId)));
    return vendor;
  }

  async createVendor(data: InsertVendor): Promise<Vendor> {
    const [vendor] = await db.insert(vendors).values(data).returning();
    return vendor;
  }

  async updateVendor(householdId: string, id: string, data: Partial<InsertVendor>): Promise<Vendor | undefined> {
    const [vendor] = await db.update(vendors)
      .set(data)
      .where(and(eq(vendors.id, id), eq(vendors.householdId, householdId)))
      .returning();
    return vendor;
  }

  async deleteVendor(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Spending (household-scoped)
  async getSpending(householdId: string): Promise<SpendingItem[]> {
    return db.select().from(spendingItems)
      .where(eq(spendingItems.householdId, householdId))
      .orderBy(desc(spendingItems.date));
  }

  async getSpendingItem(householdId: string, id: string): Promise<SpendingItem | undefined> {
    const [item] = await db.select().from(spendingItems)
      .where(and(eq(spendingItems.id, id), eq(spendingItems.householdId, householdId)));
    return item;
  }

  async createSpendingItem(data: InsertSpendingItem): Promise<SpendingItem> {
    const [item] = await db.insert(spendingItems).values(data as any).returning();
    return item;
  }

  async updateSpendingItem(householdId: string, id: string, data: Partial<InsertSpendingItem>): Promise<SpendingItem | undefined> {
    const [item] = await db.update(spendingItems)
      .set(data as any)
      .where(and(eq(spendingItems.id, id), eq(spendingItems.householdId, householdId)))
      .returning();
    return item;
  }

  async deleteSpendingItem(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(spendingItems)
      .where(and(eq(spendingItems.id, id), eq(spendingItems.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Calendar Events (household-scoped)
  async getCalendarEvents(householdId: string): Promise<CalendarEvent[]> {
    return db.select().from(calendarEvents)
      .where(eq(calendarEvents.householdId, householdId))
      .orderBy(calendarEvents.startAt);
  }

  async getCalendarEvent(householdId: string, id: string): Promise<CalendarEvent | undefined> {
    const [event] = await db.select().from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.householdId, householdId)));
    return event;
  }

  async createCalendarEvent(data: InsertCalendarEvent): Promise<CalendarEvent> {
    const [event] = await db.insert(calendarEvents).values(data).returning();
    return event;
  }

  async getCalendarEventByProviderId(householdId: string, providerEventId: string): Promise<CalendarEvent | undefined> {
    const [event] = await db.select().from(calendarEvents)
      .where(and(
        eq(calendarEvents.householdId, householdId),
        eq(calendarEvents.providerEventId, providerEventId)
      ));
    return event;
  }

  async updateCalendarEvent(householdId: string, id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const [event] = await db.update(calendarEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.householdId, householdId)))
      .returning();
    return event;
  }

  async deleteCalendarEvent(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  async deleteCalendarEventsNotIn(householdId: string, providerEventIds: string[]): Promise<number> {
    if (providerEventIds.length === 0) {
      // Delete all events for this household that have a provider ID
      const result = await db.delete(calendarEvents)
        .where(and(
          eq(calendarEvents.householdId, householdId),
          sql`${calendarEvents.providerEventId} IS NOT NULL`
        ))
        .returning();
      return result.length;
    }
    
    // Delete events not in the provided list
    const result = await db.delete(calendarEvents)
      .where(and(
        eq(calendarEvents.householdId, householdId),
        sql`${calendarEvents.providerEventId} IS NOT NULL`,
        notInArray(calendarEvents.providerEventId, providerEventIds)
      ))
      .returning();
    return result.length;
  }

  // Reactions
  async getReactions(entityType: string, entityIds: string[], householdId: string): Promise<Reaction[]> {
    if (entityIds.length === 0) return [];
    return db.select().from(reactions)
      .where(and(
        eq(reactions.entityType, entityType as any),
        inArray(reactions.entityId, entityIds),
        eq(reactions.householdId, householdId)
      ));
  }

  async getReaction(entityType: string, entityId: string, userId: string): Promise<Reaction | undefined> {
    const [reaction] = await db.select().from(reactions)
      .where(and(
        eq(reactions.entityType, entityType as any),
        eq(reactions.entityId, entityId),
        eq(reactions.userId, userId)
      ));
    return reaction;
  }

  async upsertReaction(data: InsertReaction): Promise<Reaction> {
    const existing = await this.getReaction(data.entityType as string, data.entityId, data.userId);
    if (existing) {
      const [updated] = await db.update(reactions)
        .set({ reactionType: data.reactionType, note: data.note, updatedAt: new Date() })
        .where(eq(reactions.id, existing.id))
        .returning();
      return updated;
    }
    const [reaction] = await db.insert(reactions).values(data).returning();
    return reaction;
  }

  async deleteReaction(entityType: string, entityId: string, userId: string, householdId: string): Promise<void> {
    await db.delete(reactions).where(and(
      eq(reactions.entityType, entityType as any),
      eq(reactions.entityId, entityId),
      eq(reactions.userId, userId),
      eq(reactions.householdId, householdId)
    ));
  }

  // Household Settings
  async getHouseholdSettings(householdId: string): Promise<HouseholdSettings | undefined> {
    const [settings] = await db.select().from(householdSettings).where(eq(householdSettings.householdId, householdId));
    return settings;
  }

  async upsertHouseholdSettings(householdId: string, data: Partial<InsertHouseholdSettings>): Promise<HouseholdSettings> {
    const existing = await this.getHouseholdSettings(householdId);
    if (existing) {
      const [updated] = await db.update(householdSettings)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(householdSettings.householdId, householdId))
        .returning();
      return updated;
    }
    const [settings] = await db.insert(householdSettings).values({ ...data, householdId } as any).returning();
    return settings;
  }

  // Household Locations (household-scoped)
  async getHouseholdLocations(householdId: string): Promise<HouseholdLocation[]> {
    return db.select().from(householdLocations).where(eq(householdLocations.householdId, householdId));
  }

  async getHouseholdLocation(householdId: string, id: string): Promise<HouseholdLocation | undefined> {
    const [location] = await db.select().from(householdLocations)
      .where(and(eq(householdLocations.id, id), eq(householdLocations.householdId, householdId)));
    return location;
  }

  async createHouseholdLocation(data: InsertHouseholdLocation): Promise<HouseholdLocation> {
    const [location] = await db.insert(householdLocations).values(data).returning();
    return location;
  }

  async updateHouseholdLocation(householdId: string, id: string, data: Partial<InsertHouseholdLocation>): Promise<HouseholdLocation | undefined> {
    const [location] = await db.update(householdLocations)
      .set(data)
      .where(and(eq(householdLocations.id, id), eq(householdLocations.householdId, householdId)))
      .returning();
    return location;
  }

  async deleteHouseholdLocation(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(householdLocations)
      .where(and(eq(householdLocations.id, id), eq(householdLocations.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // People (household-scoped)
  async getPeople(householdId: string): Promise<Person[]> {
    return db.select().from(people).where(eq(people.householdId, householdId));
  }

  async getPerson(householdId: string, id: string): Promise<Person | undefined> {
    const [person] = await db.select().from(people)
      .where(and(eq(people.id, id), eq(people.householdId, householdId)));
    return person;
  }

  async createPerson(data: InsertPerson): Promise<Person> {
    const [person] = await db.insert(people).values(data as any).returning();
    return person;
  }

  async updatePerson(householdId: string, id: string, data: Partial<InsertPerson>): Promise<Person | undefined> {
    const [person] = await db.update(people)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(people.id, id), eq(people.householdId, householdId)))
      .returning();
    return person;
  }

  async deletePerson(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(people)
      .where(and(eq(people.id, id), eq(people.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Preferences (household-scoped)
  async getPreferences(householdId: string): Promise<Preference[]> {
    return db.select().from(preferences).where(eq(preferences.householdId, householdId));
  }

  async getPreference(householdId: string, id: string): Promise<Preference | undefined> {
    const [preference] = await db.select().from(preferences)
      .where(and(eq(preferences.id, id), eq(preferences.householdId, householdId)));
    return preference;
  }

  async createPreference(data: InsertPreference): Promise<Preference> {
    const [preference] = await db.insert(preferences).values(data as any).returning();
    return preference;
  }

  async updatePreference(householdId: string, id: string, data: Partial<InsertPreference>): Promise<Preference | undefined> {
    const [preference] = await db.update(preferences)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(preferences.id, id), eq(preferences.householdId, householdId)))
      .returning();
    return preference;
  }

  async deletePreference(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(preferences)
      .where(and(eq(preferences.id, id), eq(preferences.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Important Dates (household-scoped)
  async getImportantDates(householdId: string): Promise<ImportantDate[]> {
    return db.select().from(importantDates).where(eq(importantDates.householdId, householdId));
  }

  async getImportantDate(householdId: string, id: string): Promise<ImportantDate | undefined> {
    const [date] = await db.select().from(importantDates)
      .where(and(eq(importantDates.id, id), eq(importantDates.householdId, householdId)));
    return date;
  }

  async createImportantDate(data: InsertImportantDate): Promise<ImportantDate> {
    const [date] = await db.insert(importantDates).values(data as any).returning();
    return date;
  }

  async updateImportantDate(householdId: string, id: string, data: Partial<InsertImportantDate>): Promise<ImportantDate | undefined> {
    const [date] = await db.update(importantDates)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(importantDates.id, id), eq(importantDates.householdId, householdId)))
      .returning();
    return date;
  }

  async deleteImportantDate(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(importantDates)
      .where(and(eq(importantDates.id, id), eq(importantDates.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Access Items (household-scoped)
  async getAccessItems(householdId: string): Promise<AccessItem[]> {
    return db.select().from(accessItems).where(eq(accessItems.householdId, householdId));
  }

  async getAccessItem(householdId: string, id: string): Promise<AccessItem | undefined> {
    const [item] = await db.select().from(accessItems)
      .where(and(eq(accessItems.id, id), eq(accessItems.householdId, householdId)));
    return item;
  }

  async createAccessItem(data: InsertAccessItem): Promise<AccessItem> {
    const [item] = await db.insert(accessItems).values(data).returning();
    return item;
  }

  async updateAccessItem(householdId: string, id: string, data: Partial<InsertAccessItem>): Promise<AccessItem | undefined> {
    const [item] = await db.update(accessItems)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(accessItems.id, id), eq(accessItems.householdId, householdId)))
      .returning();
    return item;
  }

  async deleteAccessItem(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(accessItems)
      .where(and(eq(accessItems.id, id), eq(accessItems.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Quick Request Templates (household-scoped)
  async getQuickRequestTemplates(householdId: string): Promise<QuickRequestTemplate[]> {
    return db.select().from(quickRequestTemplates)
      .where(eq(quickRequestTemplates.householdId, householdId))
      .orderBy(quickRequestTemplates.sortOrder);
  }

  async getQuickRequestTemplate(householdId: string, id: string): Promise<QuickRequestTemplate | undefined> {
    const [template] = await db.select().from(quickRequestTemplates)
      .where(and(eq(quickRequestTemplates.id, id), eq(quickRequestTemplates.householdId, householdId)));
    return template;
  }

  async createQuickRequestTemplate(data: InsertQuickRequestTemplate): Promise<QuickRequestTemplate> {
    const [template] = await db.insert(quickRequestTemplates).values(data).returning();
    return template;
  }

  async updateQuickRequestTemplate(householdId: string, id: string, data: Partial<InsertQuickRequestTemplate>): Promise<QuickRequestTemplate | undefined> {
    const [template] = await db.update(quickRequestTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(quickRequestTemplates.id, id), eq(quickRequestTemplates.householdId, householdId)))
      .returning();
    return template;
  }

  async deleteQuickRequestTemplate(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(quickRequestTemplates)
      .where(and(eq(quickRequestTemplates.id, id), eq(quickRequestTemplates.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Playbooks (household-scoped)
  async getPlaybooks(householdId: string): Promise<Playbook[]> {
    return db.select().from(playbooks)
      .where(eq(playbooks.householdId, householdId))
      .orderBy(desc(playbooks.createdAt));
  }

  async getPlaybook(householdId: string, id: string): Promise<Playbook | undefined> {
    const [playbook] = await db.select().from(playbooks)
      .where(and(eq(playbooks.id, id), eq(playbooks.householdId, householdId)));
    return playbook;
  }

  async createPlaybook(data: InsertPlaybook): Promise<Playbook> {
    const [playbook] = await db.insert(playbooks).values(data).returning();
    return playbook;
  }

  async updatePlaybook(householdId: string, id: string, data: Partial<InsertPlaybook>): Promise<Playbook | undefined> {
    const [playbook] = await db.update(playbooks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(playbooks.id, id), eq(playbooks.householdId, householdId)))
      .returning();
    return playbook;
  }

  async deletePlaybook(householdId: string, id: string): Promise<boolean> {
    const result = await db.delete(playbooks)
      .where(and(eq(playbooks.id, id), eq(playbooks.householdId, householdId)))
      .returning();
    return result.length > 0;
  }

  // Playbook Steps (scoped via playbook verification)
  async getPlaybookSteps(playbookId: string): Promise<PlaybookStep[]> {
    return db.select().from(playbookSteps)
      .where(eq(playbookSteps.playbookId, playbookId))
      .orderBy(playbookSteps.stepNumber);
  }

  async createPlaybookStep(data: InsertPlaybookStep): Promise<PlaybookStep> {
    const [step] = await db.insert(playbookSteps).values(data).returning();
    return step;
  }

  async updatePlaybookStep(householdId: string, playbookId: string, id: string, data: Partial<InsertPlaybookStep>): Promise<PlaybookStep | undefined> {
    const playbook = await this.getPlaybook(householdId, playbookId);
    if (!playbook) return undefined;
    const [step] = await db.update(playbookSteps)
      .set(data)
      .where(and(eq(playbookSteps.id, id), eq(playbookSteps.playbookId, playbookId)))
      .returning();
    return step;
  }

  async deletePlaybookStep(householdId: string, playbookId: string, id: string): Promise<boolean> {
    const playbook = await this.getPlaybook(householdId, playbookId);
    if (!playbook) return false;
    const result = await db.delete(playbookSteps)
      .where(and(eq(playbookSteps.id, id), eq(playbookSteps.playbookId, playbookId)))
      .returning();
    return result.length > 0;
  }

  // Vault Settings
  async getVaultSettings(householdId: string): Promise<VaultSettings | undefined> {
    const [settings] = await db.select().from(vaultSettings)
      .where(eq(vaultSettings.householdId, householdId));
    return settings;
  }

  async upsertVaultSettings(householdId: string, data: Partial<InsertVaultSettings>): Promise<VaultSettings> {
    const existing = await this.getVaultSettings(householdId);
    
    if (existing) {
      const [updated] = await db.update(vaultSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(vaultSettings.householdId, householdId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(vaultSettings)
        .values({ householdId, ...data })
        .returning();
      return created;
    }
  }

  // Organization Payment Profiles
  async getOrganizationPaymentProfile(organizationId: string): Promise<OrganizationPaymentProfile | undefined> {
    const [profile] = await db.select().from(organizationPaymentProfiles)
      .where(eq(organizationPaymentProfiles.organizationId, organizationId));
    return profile;
  }

  async upsertOrganizationPaymentProfile(organizationId: string, data: Partial<InsertOrganizationPaymentProfile>): Promise<OrganizationPaymentProfile> {
    const existing = await this.getOrganizationPaymentProfile(organizationId);
    
    if (existing) {
      const [updated] = await db.update(organizationPaymentProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(organizationPaymentProfiles.organizationId, organizationId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(organizationPaymentProfiles)
        .values({ organizationId, ...data })
        .returning();
      return created;
    }
  }

  // Household Payment Overrides
  async getHouseholdPaymentOverride(householdId: string): Promise<HouseholdPaymentOverride | undefined> {
    const [override] = await db.select().from(householdPaymentOverrides)
      .where(eq(householdPaymentOverrides.householdId, householdId));
    return override;
  }

  async upsertHouseholdPaymentOverride(householdId: string, data: Partial<InsertHouseholdPaymentOverride>): Promise<HouseholdPaymentOverride> {
    const existing = await this.getHouseholdPaymentOverride(householdId);
    
    if (existing) {
      const [updated] = await db.update(householdPaymentOverrides)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(householdPaymentOverrides.householdId, householdId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(householdPaymentOverrides)
        .values({ householdId, ...data })
        .returning();
      return created;
    }
  }

  // Multi-Household Support
  async getUserHouseholds(userId: string): Promise<{ id: string; name: string; organizationId: string | null; isDefault: boolean; role: string }[]> {
    const profiles = await db
      .select({
        id: households.id,
        name: households.name,
        organizationId: households.organizationId,
        isDefault: userProfiles.isDefault,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .innerJoin(households, eq(userProfiles.householdId, households.id))
      .where(eq(userProfiles.userId, userId));
    
    return profiles.map(p => ({
      id: p.id,
      name: p.name,
      organizationId: p.organizationId,
      isDefault: p.isDefault ?? false,
      role: p.role,
    }));
  }

  async setDefaultHousehold(userId: string, householdId: string): Promise<void> {
    // First, clear all isDefault flags for this user
    await db.update(userProfiles)
      .set({ isDefault: false })
      .where(eq(userProfiles.userId, userId));
    
    // Then, set the specified household as default
    await db.update(userProfiles)
      .set({ isDefault: true })
      .where(and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ));
  }
}

export const storage = new DatabaseStorage();
