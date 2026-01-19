import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Enums
export const userRoleEnum = pgEnum("user_role", ["ASSISTANT", "CLIENT", "STAFF"]);
export const taskStatusEnum = pgEnum("task_status", ["INBOX", "PLANNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "DONE", "CANCELLED"]);
export const taskCategoryEnum = pgEnum("task_category", ["HOUSEHOLD", "ERRANDS", "MAINTENANCE", "GROCERIES", "KIDS", "PETS", "EVENTS", "OTHER"]);
export const urgencyEnum = pgEnum("urgency", ["LOW", "MEDIUM", "HIGH"]);
export const recurrenceEnum = pgEnum("recurrence", ["none", "daily", "weekly", "biweekly", "monthly", "custom"]);
export const approvalStatusEnum = pgEnum("approval_status", ["PENDING", "APPROVED", "DECLINED"]);
export const entityTypeEnum = pgEnum("entity_type", ["TASK", "APPROVAL", "UPDATE", "REQUEST"]);
export const reactionTypeEnum = pgEnum("reaction_type", ["LOOKS_GOOD", "NEED_DETAILS", "PLEASE_ADJUST", "LOVE_IT", "SAVE_THIS"]);

// New enums for Household Concierge
export const communicationPrefEnum = pgEnum("communication_pref", ["IN_APP", "EMAIL", "SMS_PLACEHOLDER"]);
export const locationTypeEnum = pgEnum("location_type", ["SCHOOL", "CLINIC", "STORE", "FAMILY", "STUDIO", "OTHER"]);
export const personRoleEnum = pgEnum("person_role", ["PARENT", "CHILD", "PET", "OTHER"]);
export const preferenceCategoryEnum = pgEnum("preference_category", ["FOOD_DRINK", "PANTRY", "GIFTS_FLOWERS", "HOME", "COMMUNICATION", "OTHER"]);
export const importantDateTypeEnum = pgEnum("important_date_type", ["BIRTHDAY", "ANNIVERSARY", "MEMORIAL", "HOLIDAY", "OTHER"]);
export const accessItemCategoryEnum = pgEnum("access_item_category", ["ENTRY", "WIFI", "ALARM", "LOCKS", "GARAGE", "OTHER"]);

// Notification enums
export const notificationFrequencyEnum = pgEnum("notification_frequency", ["IMMEDIATE", "DAILY_DIGEST", "OFF"]);
export const notificationTypeEnum = pgEnum("notification_type", ["APPROVAL_NEEDED", "TASK_WAITING", "DAILY_DIGEST", "WEEKLY_BRIEF", "UPDATE_POSTED", "REQUEST_RECEIVED", "TASK_CANCELLED"]);

// Organization status enum
export const organizationStatusEnum = pgEnum("organization_status", ["ACTIVE", "SUSPENDED", "TRIAL"]);

// Payment enums
export const spendingStatusEnum = pgEnum("spending_status", ["DRAFT", "NEEDS_APPROVAL", "APPROVED", "PAYMENT_SENT", "RECONCILED"]);
export const paymentMethodEnum = pgEnum("payment_method", ["VENMO", "ZELLE", "CASH_APP", "PAYPAL"]);
export const spendingKindEnum = pgEnum("spending_kind", ["REIMBURSEMENT", "INVOICE"]);

// Service enums (for CLEANING vs PA multi-service support)
export const serviceTypeEnum = pgEnum("service_type", ["CLEANING", "PA"]);
export const serviceRoleEnum = pgEnum("service_role", ["CLIENT", "PROVIDER"]);

// Organizations (multi-tenancy parent)
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  slug: varchar("slug").unique(),
  status: organizationStatusEnum("status").default("ACTIVE").notNull(),
  ownerId: varchar("owner_id").notNull(),
  maxHouseholds: integer("max_households").default(5),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Households
export const households = pgTable("households", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Profiles (extends auth users)
export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  householdId: varchar("household_id").references(() => households.id),
  organizationId: varchar("organization_id").references(() => organizations.id),
  role: userRoleEnum("role").default("CLIENT").notNull(),
  isDefault: boolean("is_default").default(false),
  defaultServiceType: serviceTypeEnum("default_service_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Household Service Memberships (multi-service support)
export const householdServiceMemberships = pgTable("household_service_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  userId: varchar("user_id").notNull(),
  serviceType: serviceTypeEnum("service_type").notNull(),
  serviceRole: serviceRoleEnum("service_role").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("household_service_memberships_household_idx").on(table.householdId),
  index("household_service_memberships_user_idx").on(table.userId),
]);

// Tasks
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").default("INBOX").notNull(),
  category: taskCategoryEnum("category").default("OTHER").notNull(),
  urgency: urgencyEnum("urgency").default("MEDIUM").notNull(),
  dueAt: timestamp("due_at"),
  location: text("location"),
  notes: text("notes"),
  assignedTo: varchar("assigned_to"),
  createdBy: varchar("created_by").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  serviceType: serviceTypeEnum("service_type").default("PA").notNull(),
  images: jsonb("images").$type<string[]>().default([]),
  recurrence: recurrenceEnum("recurrence").default("none"),
  recurrenceCustomDays: integer("recurrence_custom_days"),
  recurrenceGroupId: varchar("recurrence_group_id"),
  recurrenceOccurrence: integer("recurrence_occurrence").default(1),
  estimatedMinutes: integer("estimated_minutes"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tasks_household_id_idx").on(table.householdId),
  index("tasks_status_idx").on(table.status),
  index("tasks_due_at_idx").on(table.dueAt),
  index("tasks_recurrence_group_idx").on(table.recurrenceGroupId),
  index("tasks_service_type_idx").on(table.serviceType),
]);

// Task Checklist Items
export const taskChecklistItems = pgTable("task_checklist_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  text: text("text").notNull(),
  done: boolean("done").default(false).notNull(),
  order: integer("order").default(0).notNull(),
});

// Task Templates
export const taskTemplates = pgTable("task_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  title: text("title").notNull(),
  category: taskCategoryEnum("category").default("OTHER").notNull(),
  urgency: urgencyEnum("urgency").default("MEDIUM").notNull(),
  location: text("location"),
  checklistItems: jsonb("checklist_items").$type<{ text: string }[]>().default([]),
  icon: text("icon").default("file-text"),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Approvals
export const approvals = pgTable("approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  details: text("details"),
  amount: integer("amount"),
  status: approvalStatusEnum("status").default("PENDING").notNull(),
  links: jsonb("links").$type<string[]>().default([]),
  images: jsonb("images").$type<string[]>().default([]),
  relatedTaskId: varchar("related_task_id").references(() => tasks.id),
  serviceType: serviceTypeEnum("service_type").default("PA").notNull(),
  createdBy: varchar("created_by").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("approvals_household_id_idx").on(table.householdId),
  index("approvals_status_idx").on(table.status),
  index("approvals_related_task_id_idx").on(table.relatedTaskId),
  index("approvals_service_type_idx").on(table.serviceType),
]);

// Updates (assistant posts)
export const updates = pgTable("updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  images: jsonb("images").$type<string[]>().default([]),
  receipts: jsonb("receipts").$type<string[]>().default([]),
  relatedTaskId: varchar("related_task_id").references(() => tasks.id),
  serviceType: serviceTypeEnum("service_type").default("PA").notNull(),
  createdBy: varchar("created_by").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  reactions: jsonb("reactions").$type<Record<string, string[]>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("updates_household_id_idx").on(table.householdId),
  index("updates_created_at_idx").on(table.createdAt),
  index("updates_service_type_idx").on(table.serviceType),
]);

// Requests (client asks)
export const requests = pgTable("requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  category: taskCategoryEnum("category").default("OTHER").notNull(),
  urgency: urgencyEnum("urgency").default("MEDIUM").notNull(),
  dueAt: timestamp("due_at"),
  images: jsonb("images").$type<string[]>().default([]),
  taskId: varchar("task_id").references(() => tasks.id),
  createdBy: varchar("created_by").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Comments
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  userId: varchar("user_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reactions
export const reactions = pgTable("reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  reactionType: reactionTypeEnum("reaction_type").notNull(),
  note: text("note"),
  userId: varchar("user_id").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Vendors
export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  category: text("category"),
  canEnterAlone: boolean("can_enter_alone").default(false),
  requiresApproval: boolean("requires_approval").default(true),
  preferredTimes: text("preferred_times"),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Spending Items
export const spendingItems = pgTable("spending_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  amount: integer("amount").notNull(),
  category: text("category"),
  vendor: text("vendor"),
  note: text("note"),
  date: timestamp("date").defaultNow(),
  receipts: jsonb("receipts").$type<string[]>().default([]),
  createdBy: varchar("created_by").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  serviceType: serviceTypeEnum("service_type").default("PA").notNull(),
  relatedTaskId: varchar("related_task_id").references(() => tasks.id),
  status: spendingStatusEnum("status").default("DRAFT").notNull(),
  paymentMethodUsed: paymentMethodEnum("payment_method_used"),
  paymentNote: text("payment_note"),
  paymentReferenceCode: varchar("payment_reference_code", { length: 20 }),
  paidAt: timestamp("paid_at"),
  reconciledAt: timestamp("reconciled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  // Invoice-specific fields
  kind: spendingKindEnum("kind").default("REIMBURSEMENT").notNull(),
  title: text("title"),
  dueDate: timestamp("due_date"),
  invoiceNumber: varchar("invoice_number", { length: 30 }),
  sentAt: timestamp("sent_at"),
  // Tipping
  tipAmount: integer("tip_amount").default(0),
}, (table) => [
  index("spending_items_household_id_idx").on(table.householdId),
  index("spending_items_date_idx").on(table.date),
  index("spending_items_status_idx").on(table.status),
  index("spending_items_kind_status_idx").on(table.householdId, table.kind, table.status),
  index("spending_items_service_type_idx").on(table.serviceType),
]);

// Calendar Events (for demo mode)
export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerEventId: text("provider_event_id"),
  calendarId: text("calendar_id"),
  title: text("title").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  location: text("location"),
  description: text("description"),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("calendar_events_household_id_idx").on(table.householdId),
  index("calendar_events_start_at_idx").on(table.startAt),
]);

// Household Settings (Concierge Profile)
export const householdSettings = pgTable("household_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull().unique(),
  timezone: text("timezone").default("America/Chicago"),
  primaryAddress: text("primary_address"),
  secondaryAddress: text("secondary_address"),
  entryInstructions: text("entry_instructions"),
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  approvalThreshold: integer("approval_threshold").default(10000),
  communicationPreference: communicationPrefEnum("communication_preference").default("IN_APP"),
  whenInDoubtRules: jsonb("when_in_doubt_rules").$type<string[]>().default([]),
  delightBudgetEnabled: boolean("delight_budget_enabled").default(false),
  delightBudgetAmount: integer("delight_budget_amount"),
  onboardingPhase1Complete: boolean("onboarding_phase1_complete").default(false),
  onboardingPhase2Complete: boolean("onboarding_phase2_complete").default(false),
  onboardingPhase3Complete: boolean("onboarding_phase3_complete").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Household Locations (schools, clinics, stores, etc.)
export const householdLocations = pgTable("household_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  name: text("name").notNull(),
  type: locationTypeEnum("type").default("OTHER").notNull(),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// People (household members and pets)
export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  fullName: text("full_name").notNull(),
  preferredName: text("preferred_name"),
  role: personRoleEnum("role").default("OTHER").notNull(),
  birthday: timestamp("birthday"),
  celebrationStyle: jsonb("celebration_style").$type<string[]>().default([]),
  allergies: jsonb("allergies").$type<string[]>().default([]),
  allergyNotes: text("allergy_notes"),
  dietaryRules: jsonb("dietary_rules").$type<string[]>().default([]),
  dietNotes: text("diet_notes"),
  clothingSize: text("clothing_size"),
  shoeSize: text("shoe_size"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Preferences (household preferences brain)
export const preferences = pgTable("preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  category: preferenceCategoryEnum("category").default("OTHER").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  isNoGo: boolean("is_no_go").default(false),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Important Dates (birthdays, anniversaries, holidays, etc.)
export const importantDates = pgTable("important_dates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  type: importantDateTypeEnum("type").default("OTHER").notNull(),
  title: text("title").notNull(),
  date: timestamp("date").notNull(),
  reminderOffsetsDays: jsonb("reminder_offsets_days").$type<number[]>().default([14]),
  notes: text("notes"),
  personId: varchar("person_id").references(() => people.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Access Items (secure info like WiFi, alarm codes, etc.)
export const accessItems = pgTable("access_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  category: accessItemCategoryEnum("category").default("OTHER").notNull(),
  title: text("title").notNull(),
  value: text("value").notNull(),
  notes: text("notes"),
  isSensitive: boolean("is_sensitive").default(true),
  isEncrypted: boolean("is_encrypted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Access Item Grants (for STAFF access to secrets)
export const accessItemGrants = pgTable("access_item_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accessItemId: varchar("access_item_id").references(() => accessItems.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("access_item_grants_user_idx").on(table.userId),
  index("access_item_grants_item_idx").on(table.accessItemId),
]);

// Notifications (in-app notification center)
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  userId: varchar("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  linkUrl: text("link_url"),
  isRead: boolean("is_read").default(false).notNull(),
  emailSent: boolean("email_sent").default(false),
  smsSent: boolean("sms_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Quick Request Templates (configurable one-tap request buttons)
export const quickRequestTemplates = pgTable("quick_request_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: taskCategoryEnum("category").default("OTHER").notNull(),
  urgency: urgencyEnum("urgency").default("MEDIUM").notNull(),
  icon: text("icon").default("MessageSquare"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notification Settings (per user preferences)
export const notificationSettings = pgTable("notification_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  approvalFrequency: notificationFrequencyEnum("approval_frequency").default("IMMEDIATE"),
  updateFrequency: notificationFrequencyEnum("update_frequency").default("DAILY_DIGEST"),
  dailyDigestTime: text("daily_digest_time").default("18:00"),
  weeklyBriefDay: text("weekly_brief_day").default("monday"),
  weeklyBriefTime: text("weekly_brief_time").default("08:00"),
  emailEnabled: boolean("email_enabled").default(true),
  smsEnabled: boolean("sms_enabled").default(false),
  pushEnabled: boolean("push_enabled").default(false),
  phoneNumber: text("phone_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Push Notification Subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("push_subscriptions_user_id_idx").on(table.userId),
]);

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

// Playbooks (SOP Templates for recurring procedures)
export const playbooks = pgTable("playbooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: taskCategoryEnum("category").default("OTHER").notNull(),
  icon: text("icon").default("ClipboardList"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Playbook Steps (individual steps within a playbook)
export const playbookSteps = pgTable("playbook_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playbookId: varchar("playbook_id").references(() => playbooks.id, { onDelete: "cascade" }).notNull(),
  stepNumber: integer("step_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  estimatedMinutes: integer("estimated_minutes"),
  isOptional: boolean("is_optional").default(false).notNull(),
});

// Audit Log (trust layer for tracking all changes)
export const auditLogEntityTypeEnum = pgEnum("audit_log_entity_type", [
  "TASK", "APPROVAL", "UPDATE", "REQUEST", "VENDOR", "SPENDING", 
  "CALENDAR_EVENT", "VAULT", "SETTINGS", "PLAYBOOK", "MEMBER", "HOUSEHOLD"
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  entityType: auditLogEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ip: varchar("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Vault Settings (PIN unlock and security)
export const vaultSettings = pgTable("vault_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull().unique(),
  pinHash: text("pin_hash"),
  autoLockMinutes: integer("auto_lock_minutes").default(5),
  requirePinForSensitive: boolean("require_pin_for_sensitive").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================
// PHASE 1: LAUNCH-CRITICAL ENHANCEMENTS
// ============================================

// Subscription Plans & Billing
export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "FREE", "HOUSEHOLD_BASIC", "HOUSEHOLD_PREMIUM", "PRO_STARTER", "PRO_GROWTH", "ENTERPRISE"
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE", "PAST_DUE", "CANCELED", "TRIALING"
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "PAID", "PENDING", "FAILED"
]);

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id).notNull(),
  plan: subscriptionPlanEnum("plan").default("FREE").notNull(),
  status: subscriptionStatusEnum("status").default("ACTIVE").notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEndsAt: timestamp("trial_ends_at"),
  seats: integer("seats").default(1),
  householdLimit: integer("household_limit").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id).notNull(),
  stripePaymentMethodId: varchar("stripe_payment_method_id"),
  brand: varchar("brand"),
  last4: varchar("last4"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id).notNull(),
  stripeInvoiceId: varchar("stripe_invoice_id"),
  amount: integer("amount").notNull(),
  status: invoiceStatusEnum("status").default("PENDING").notNull(),
  invoiceUrl: text("invoice_url"),
  invoicePdfUrl: text("invoice_pdf_url"),
  billingDate: timestamp("billing_date"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analytics Events (for enhanced reporting)
export const analyticsEventTypeEnum = pgEnum("analytics_event_type", [
  "TASK_CREATED", "TASK_COMPLETED", "TASK_OVERDUE",
  "APPROVAL_REQUESTED", "APPROVAL_APPROVED", "APPROVAL_DECLINED",
  "REQUEST_CREATED", "REQUEST_RESPONDED",
  "UPDATE_POSTED", "LOGIN", "SESSION_END"
]);

export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  userId: varchar("user_id"),
  eventType: analyticsEventTypeEnum("event_type").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// Emergency Protocols & Contacts
export const emergencyTypeEnum = pgEnum("emergency_type", [
  "MEDICAL", "FIRE", "SECURITY", "UTILITY", "OTHER"
]);

export const emergencyPriorityEnum = pgEnum("emergency_priority", [
  "CRITICAL", "HIGH", "MEDIUM"
]);

export const emergencyContacts = pgTable("emergency_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  name: text("name").notNull(),
  relationship: text("relationship"),
  phone: text("phone"),
  email: text("email"),
  isPrimary: boolean("is_primary").default(false),
  availableHours: text("available_hours"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emergencyProtocols = pgTable("emergency_protocols", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  type: emergencyTypeEnum("type").default("OTHER").notNull(),
  title: text("title").notNull(),
  instructions: text("instructions"),
  contactIds: jsonb("contact_ids").$type<string[]>().default([]),
  priority: emergencyPriorityEnum("priority").default("MEDIUM").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// In-App Messaging
export const conversationTypeEnum = pgEnum("conversation_type", [
  "CLIENT_ASSISTANT", "VENDOR_SPECIFIC", "HOUSEHOLD_GENERAL"
]);

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  type: conversationTypeEnum("type").default("CLIENT_ASSISTANT").notNull(),
  participantIds: jsonb("participant_ids").$type<string[]>().default([]),
  title: text("title"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  senderId: varchar("sender_id").notNull(),
  text: text("text"),
  attachments: jsonb("attachments").$type<string[]>().default([]),
  isVoice: boolean("is_voice").default(false),
  voiceTranscription: text("voice_transcription"),
  readBy: jsonb("read_by").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

// Google Calendar Connections
export const calendarConnections = pgTable("calendar_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  userId: varchar("user_id").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  tokenExpiry: timestamp("token_expiry").notNull(),
  email: varchar("email"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const calendarSelections = pgTable("calendar_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").references(() => calendarConnections.id, { onDelete: "cascade" }).notNull(),
  calendarId: varchar("calendar_id").notNull(),
  calendarName: text("calendar_name"),
  color: varchar("color"),
  isEnabled: boolean("is_enabled").default(true),
  lastSynced: timestamp("last_synced"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Household Invites
export const inviteStatusEnum = pgEnum("invite_status", ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]);
export const inviteRoleEnum = pgEnum("invite_role", ["ASSISTANT", "CLIENT", "STAFF"]);

export const householdInvites = pgTable("household_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  email: varchar("email").notNull(),
  role: inviteRoleEnum("role").default("CLIENT").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  status: inviteStatusEnum("status").default("PENDING").notNull(),
  createdBy: varchar("created_by").notNull(),
  acceptedBy: varchar("accepted_by"),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Provider Settings (per organization)
export const aiProviderEnum = pgEnum("ai_provider", ["ANTHROPIC", "OPENAI", "NONE"]);

export const aiSettings = pgTable("ai_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id).notNull().unique(),
  provider: aiProviderEnum("provider").default("NONE").notNull(),
  enabled: boolean("enabled").default(false),
  creditsUsed: integer("credits_used").default(0),
  creditsLimit: integer("credits_limit").default(1000),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Organization Payment Profiles (assistant's default payment receiving info)
export const organizationPaymentProfiles = pgTable("organization_payment_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id).notNull().unique(),
  venmoUsername: varchar("venmo_username", { length: 50 }),
  zelleRecipient: varchar("zelle_recipient", { length: 100 }),
  cashAppCashtag: varchar("cash_app_cashtag", { length: 30 }),
  paypalMeHandle: varchar("paypal_me_handle", { length: 50 }),
  defaultPaymentMethod: paymentMethodEnum("default_payment_method").default("VENMO"),
  payNoteTemplate: text("pay_note_template").default("hndld • Reimbursement {ref} • {category} • {date}"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Household Payment Overrides (per-household override of org payment profile)
export const householdPaymentOverrides = pgTable("household_payment_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull().unique(),
  useOrgDefaults: boolean("use_org_defaults").default(true).notNull(),
  venmoUsername: varchar("venmo_username", { length: 50 }),
  zelleRecipient: varchar("zelle_recipient", { length: 100 }),
  cashAppCashtag: varchar("cash_app_cashtag", { length: 30 }),
  paypalMeHandle: varchar("paypal_me_handle", { length: 50 }),
  defaultPaymentMethod: paymentMethodEnum("default_payment_method"),
  payNoteTemplate: text("pay_note_template"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// File Library - Enums
export const fileCategoryEnum = pgEnum("file_category", ["RECEIPT", "DOCUMENT", "PHOTO", "VIDEO", "OTHER"]);
export const storageProviderEnum = pgEnum("storage_provider", ["LOCAL", "S3", "R2"]);
export const fileEntityTypeEnum = pgEnum("file_entity_type", ["TASK", "UPDATE", "SPENDING", "REQUEST", "APPROVAL", "PERSON", "VENDOR"]);

// Files - Central file library
export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id, { onDelete: "cascade" }).notNull(),
  uploadedBy: varchar("uploaded_by").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  storedFilename: varchar("stored_filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  storageProvider: storageProviderEnum("storage_provider").default("LOCAL").notNull(),
  storagePath: varchar("storage_path", { length: 500 }).notNull(),
  publicUrl: varchar("public_url", { length: 500 }),
  width: integer("width"),
  height: integer("height"),
  thumbnailPath: varchar("thumbnail_path", { length: 500 }),
  category: fileCategoryEnum("category").default("OTHER").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  description: text("description"),
  linkedCount: integer("linked_count").default(0),
  viewCount: integer("view_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("files_household_idx").on(table.householdId),
  index("files_category_idx").on(table.category),
  index("files_uploaded_by_idx").on(table.uploadedBy),
  index("files_deleted_idx").on(table.deletedAt),
]);

// File Links - Links files to entities (many-to-many)
export const fileLinks = pgTable("file_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").references(() => files.id, { onDelete: "cascade" }).notNull(),
  entityType: fileEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  linkedBy: varchar("linked_by").notNull(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  note: text("note"),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("file_links_file_idx").on(table.fileId),
  index("file_links_entity_idx").on(table.entityType, table.entityId),
  index("file_links_deleted_idx").on(table.deletedAt),
]);

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  households: many(households),
}));

export const householdsRelations = relations(households, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [households.organizationId],
    references: [organizations.id],
  }),
  userProfiles: many(userProfiles),
  tasks: many(tasks),
  approvals: many(approvals),
  updates: many(updates),
  requests: many(requests),
  vendors: many(vendors),
  spendingItems: many(spendingItems),
  calendarEvents: many(calendarEvents),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  household: one(households, {
    fields: [userProfiles.householdId],
    references: [households.id],
  }),
  organization: one(organizations, {
    fields: [userProfiles.organizationId],
    references: [organizations.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  household: one(households, {
    fields: [tasks.householdId],
    references: [households.id],
  }),
  checklistItems: many(taskChecklistItems),
}));

export const taskChecklistItemsRelations = relations(taskChecklistItems, ({ one }) => ({
  task: one(tasks, {
    fields: [taskChecklistItems.taskId],
    references: [tasks.id],
  }),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  household: one(households, {
    fields: [files.householdId],
    references: [households.id],
  }),
  links: many(fileLinks),
}));

export const fileLinksRelations = relations(fileLinks, ({ one }) => ({
  file: one(files, {
    fields: [fileLinks.fileId],
    references: [files.id],
  }),
}));

// Insert schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHouseholdSchema = createInsertSchema(households).omit({ id: true, createdAt: true });
export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({ id: true, createdAt: true });
export const insertHouseholdServiceMembershipSchema = createInsertSchema(householdServiceMemberships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTaskChecklistItemSchema = createInsertSchema(taskChecklistItems).omit({ id: true });
export const insertTaskTemplateSchema = createInsertSchema(taskTemplates).omit({ id: true, createdAt: true });
export const insertApprovalSchema = createInsertSchema(approvals).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUpdateSchema = createInsertSchema(updates).omit({ id: true, createdAt: true });
export const insertRequestSchema = createInsertSchema(requests).omit({ id: true, createdAt: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export const insertReactionSchema = createInsertSchema(reactions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export const insertSpendingItemSchema = createInsertSchema(spendingItems).omit({ id: true, createdAt: true });
export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHouseholdSettingsSchema = createInsertSchema(householdSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHouseholdLocationSchema = createInsertSchema(householdLocations).omit({ id: true, createdAt: true });
export const insertPersonSchema = createInsertSchema(people).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPreferenceSchema = createInsertSchema(preferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertImportantDateSchema = createInsertSchema(importantDates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAccessItemSchema = createInsertSchema(accessItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAccessItemGrantSchema = createInsertSchema(accessItemGrants).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuickRequestTemplateSchema = createInsertSchema(quickRequestTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlaybookSchema = createInsertSchema(playbooks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlaybookStepSchema = createInsertSchema(playbookSteps).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertVaultSettingsSchema = createInsertSchema(vaultSettings).omit({ id: true, createdAt: true, updatedAt: true });

// Phase 1 Insert Schemas
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({ id: true, createdAt: true });
export const insertEmergencyContactSchema = createInsertSchema(emergencyContacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmergencyProtocolSchema = createInsertSchema(emergencyProtocols).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertAiSettingsSchema = createInsertSchema(aiSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCalendarConnectionSchema = createInsertSchema(calendarConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCalendarSelectionSchema = createInsertSchema(calendarSelections).omit({ id: true, createdAt: true });
export const insertHouseholdInviteSchema = createInsertSchema(householdInvites).omit({ id: true, createdAt: true });
export const insertFileSchema = createInsertSchema(files).omit({ id: true, uploadedAt: true, updatedAt: true, linkedCount: true, viewCount: true, lastViewedAt: true, deletedAt: true });
export const insertFileLinkSchema = createInsertSchema(fileLinks).omit({ id: true, linkedAt: true, deletedAt: true });
export const insertOrganizationPaymentProfileSchema = createInsertSchema(organizationPaymentProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHouseholdPaymentOverrideSchema = createInsertSchema(householdPaymentOverrides).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type Household = typeof households.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type HouseholdServiceMembership = typeof householdServiceMemberships.$inferSelect;
export type InsertHouseholdServiceMembership = z.infer<typeof insertHouseholdServiceMembershipSchema>;
export type ServiceType = "CLEANING" | "PA";
export type ServiceRole = "CLIENT" | "PROVIDER";
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;
export type InsertTaskChecklistItem = z.infer<typeof insertTaskChecklistItemSchema>;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;
export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Update = typeof updates.$inferSelect;
export type InsertUpdate = z.infer<typeof insertUpdateSchema>;
export type Request = typeof requests.$inferSelect;
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Reaction = typeof reactions.$inferSelect;
export type InsertReaction = z.infer<typeof insertReactionSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type SpendingItem = typeof spendingItems.$inferSelect;
export type InsertSpendingItem = z.infer<typeof insertSpendingItemSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type HouseholdSettings = typeof householdSettings.$inferSelect;
export type InsertHouseholdSettings = z.infer<typeof insertHouseholdSettingsSchema>;
export type HouseholdLocation = typeof householdLocations.$inferSelect;
export type InsertHouseholdLocation = z.infer<typeof insertHouseholdLocationSchema>;
export type Person = typeof people.$inferSelect;
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Preference = typeof preferences.$inferSelect;
export type InsertPreference = z.infer<typeof insertPreferenceSchema>;
export type ImportantDate = typeof importantDates.$inferSelect;
export type InsertImportantDate = z.infer<typeof insertImportantDateSchema>;
export type AccessItem = typeof accessItems.$inferSelect;
export type InsertAccessItem = z.infer<typeof insertAccessItemSchema>;
export type AccessItemGrant = typeof accessItemGrants.$inferSelect;
export type InsertAccessItemGrant = z.infer<typeof insertAccessItemGrantSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;
export type QuickRequestTemplate = typeof quickRequestTemplates.$inferSelect;
export type InsertQuickRequestTemplate = z.infer<typeof insertQuickRequestTemplateSchema>;
export type Playbook = typeof playbooks.$inferSelect;
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;
export type PlaybookStep = typeof playbookSteps.$inferSelect;
export type InsertPlaybookStep = z.infer<typeof insertPlaybookStepSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type VaultSettings = typeof vaultSettings.$inferSelect;
export type InsertVaultSettings = z.infer<typeof insertVaultSettingsSchema>;

// Phase 1 Types
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type EmergencyContact = typeof emergencyContacts.$inferSelect;
export type InsertEmergencyContact = z.infer<typeof insertEmergencyContactSchema>;
export type EmergencyProtocol = typeof emergencyProtocols.$inferSelect;
export type InsertEmergencyProtocol = z.infer<typeof insertEmergencyProtocolSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type AiSettings = typeof aiSettings.$inferSelect;
export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type InsertCalendarConnection = z.infer<typeof insertCalendarConnectionSchema>;
export type CalendarSelection = typeof calendarSelections.$inferSelect;
export type InsertCalendarSelection = z.infer<typeof insertCalendarSelectionSchema>;
export type HouseholdInvite = typeof householdInvites.$inferSelect;
export type InsertHouseholdInvite = z.infer<typeof insertHouseholdInviteSchema>;
export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type FileLink = typeof fileLinks.$inferSelect;
export type InsertFileLink = z.infer<typeof insertFileLinkSchema>;
export type OrganizationPaymentProfile = typeof organizationPaymentProfiles.$inferSelect;
export type InsertOrganizationPaymentProfile = z.infer<typeof insertOrganizationPaymentProfileSchema>;
export type HouseholdPaymentOverride = typeof householdPaymentOverrides.$inferSelect;
export type InsertHouseholdPaymentOverride = z.infer<typeof insertHouseholdPaymentOverrideSchema>;
