/**
 * Schema Additions for Proactive AI
 * 
 * FILE: shared/schema.ts
 * ACTION: Add these table definitions to your existing schema
 * 
 * Then run: npm run db:push
 */

// ADD THESE IMPORTS if not already present
import { pgTable, text, timestamp, boolean, integer, jsonb, uuid } from "drizzle-orm/pg-core";

// ============================================================================
// PROACTIVE INSIGHTS TABLE
// Stores AI-generated insights for users
// ============================================================================

export const proactiveInsights = pgTable("proactive_insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: text("household_id").notNull(),
  userId: text("user_id"), // Optional - can be household-wide
  
  type: text("type").notNull(), // REMINDER, SUGGESTION, ALERT, OPPORTUNITY
  priority: text("priority").notNull().default("LOW"), // LOW, MEDIUM, HIGH
  title: text("title").notNull(),
  body: text("body").notNull(),
  
  actionLabel: text("action_label"),
  actionUrl: text("action_url"),
  
  isDismissed: boolean("is_dismissed").default(false),
  isActedOn: boolean("is_acted_on").default(false),
  
  metadata: jsonb("metadata").default({}),
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProactiveInsight = typeof proactiveInsights.$inferSelect;
export type InsertProactiveInsight = typeof proactiveInsights.$inferInsert;

// ============================================================================
// TASK PATTERNS TABLE
// Stores learned patterns from task completions
// ============================================================================

export const taskPatterns = pgTable("task_patterns", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: text("household_id").notNull(),
  taskId: text("task_id").notNull(),
  
  category: text("category").notNull(),
  estimatedMinutes: integer("estimated_minutes").default(0),
  actualMinutes: integer("actual_minutes").notNull(),
  
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  hourOfDay: integer("hour_of_day").notNull(), // 0-23
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TaskPattern = typeof taskPatterns.$inferSelect;
export type InsertTaskPattern = typeof taskPatterns.$inferInsert;

// ============================================================================
// CONVERSATION MEMORIES TABLE
// Stores summaries of past AI conversations for context
// ============================================================================

export const conversationMemories = pgTable("conversation_memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: text("household_id").notNull(),
  
  summary: text("summary").notNull(),
  extractedPreferences: jsonb("extracted_preferences").default({}),
  extractedFacts: jsonb("extracted_facts").default({}),
  
  messageCount: integer("message_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ConversationMemory = typeof conversationMemories.$inferSelect;
export type InsertConversationMemory = typeof conversationMemories.$inferInsert;

// ============================================================================
// HOUSEHOLD PREFERENCES TABLE (AI-Learned)
// Stores learned preferences for better personalization
// ============================================================================

export const learnedPreferences = pgTable("learned_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: text("household_id").notNull(),
  
  category: text("category").notNull(), // e.g., "scheduling", "communication", "vendors"
  key: text("key").notNull(), // e.g., "preferred_grocery_day", "favorite_florist"
  value: text("value").notNull(),
  
  confidence: text("confidence").default("low"), // low, medium, high
  source: text("source").default("inferred"), // explicit, inferred, pattern
  
  lastUsedAt: timestamp("last_used_at"),
  useCount: integer("use_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LearnedPreference = typeof learnedPreferences.$inferSelect;
export type InsertLearnedPreference = typeof learnedPreferences.$inferInsert;
