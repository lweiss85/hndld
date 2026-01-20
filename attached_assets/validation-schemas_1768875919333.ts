import { z } from "zod";

// =============================================================================
// TASK SCHEMAS
// =============================================================================

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000, "Description too long").optional().nullable(),
  category: z.enum(["HOUSEHOLD", "ERRANDS", "MAINTENANCE", "GROCERIES", "KIDS", "PETS", "EVENTS", "OTHER"]).optional(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  estimatedMinutes: z.number().int().positive().max(1440).optional().nullable(),
  recurrence: z.enum(["none", "daily", "weekly", "biweekly", "monthly", "custom"]).optional(),
  recurrenceCustomDays: z.number().int().positive().max(365).optional().nullable(),
  images: z.array(z.string()).optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["INBOX", "PLANNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "DONE", "CANCELLED"]).optional(),
});

export const cancelTaskSchema = z.object({
  reason: z.string().max(1000).optional(),
});

// =============================================================================
// APPROVAL SCHEMAS
// =============================================================================

export const createApprovalSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  details: z.string().max(5000, "Details too long").optional().nullable(),
  amount: z.number().int().min(0).optional().nullable(),
  links: z.array(z.string().url()).max(10).optional(),
  images: z.array(z.string()).max(10).optional(),
});

export const updateApprovalSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DECLINED"]),
});

// =============================================================================
// REQUEST SCHEMAS
// =============================================================================

export const createRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000, "Description too long").optional().nullable(),
  category: z.enum(["HOUSEHOLD", "ERRANDS", "MAINTENANCE", "GROCERIES", "KIDS", "PETS", "EVENTS", "OTHER"]).optional(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  images: z.array(z.string()).max(10).optional(),
});

// =============================================================================
// ACCESS ITEM (VAULT) SCHEMAS
// =============================================================================

export const createAccessItemSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  value: z.string().min(1, "Value is required").max(1000, "Value too long"),
  category: z.enum(["ENTRY", "WIFI", "ALARM", "LOCKS", "GARAGE", "OTHER"]).optional(),
  notes: z.string().max(2000, "Notes too long").optional().nullable(),
  isSensitive: z.boolean().optional(),
});

export const updateAccessItemSchema = createAccessItemSchema.partial();

// =============================================================================
// CALENDAR EVENT SCHEMAS
// =============================================================================

export const createEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000, "Description too long").optional().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  isAllDay: z.boolean().optional(),
  recurrence: z.enum(["none", "daily", "weekly", "biweekly", "monthly", "custom"]).optional(),
});

export const updateEventSchema = createEventSchema.partial();

// =============================================================================
// UPDATE SCHEMAS
// =============================================================================

export const createUpdateSchema = z.object({
  text: z.string().min(1, "Text is required").max(5000, "Text too long"),
  taskId: z.string().optional().nullable(),
  images: z.array(z.string()).max(10).optional(),
});

// =============================================================================
// COMMENT SCHEMAS
// =============================================================================

export const createCommentSchema = z.object({
  entityType: z.enum(["TASK", "APPROVAL", "UPDATE", "REQUEST"]),
  entityId: z.string().min(1),
  text: z.string().min(1, "Comment text required").max(2000, "Comment too long"),
});

// =============================================================================
// SPENDING SCHEMAS
// =============================================================================

export const createSpendingSchema = z.object({
  description: z.string().min(1).max(500),
  amountInCents: z.number().int().positive(),
  date: z.string().datetime().optional(),
  category: z.string().max(100).optional(),
  vendor: z.string().max(200).optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  kind: z.enum(["REIMBURSEMENT", "INVOICE"]).optional(),
});

export const updateSpendingSchema = createSpendingSchema.partial().extend({
  status: z.enum(["DRAFT", "NEEDS_APPROVAL", "APPROVED", "PAYMENT_SENT", "RECONCILED"]).optional(),
});

// =============================================================================
// VENDOR SCHEMAS
// =============================================================================

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isPreferred: z.boolean().optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

// =============================================================================
// HOUSEHOLD PROFILE SCHEMAS
// =============================================================================

export const updateHouseholdSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
  timezone: z.string().max(100).optional().nullable(),
});

// =============================================================================
// PERSON SCHEMAS
// =============================================================================

export const createPersonSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.enum(["PARENT", "CHILD", "PET", "OTHER"]).optional(),
  birthdate: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
});

export const updatePersonSchema = createPersonSchema.partial();

// =============================================================================
// IMPORTANT DATE SCHEMAS
// =============================================================================

export const createImportantDateSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string(), // Can be MM-DD or full date
  type: z.enum(["BIRTHDAY", "ANNIVERSARY", "MEMORIAL", "HOLIDAY", "OTHER"]).optional(),
  personId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isRecurring: z.boolean().optional(),
});

export const updateImportantDateSchema = createImportantDateSchema.partial();

// =============================================================================
// PREFERENCE SCHEMAS
// =============================================================================

export const createPreferenceSchema = z.object({
  category: z.enum(["FOOD_DRINK", "PANTRY", "GIFTS_FLOWERS", "HOME", "COMMUNICATION", "OTHER"]),
  title: z.string().min(1).max(200),
  value: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  personId: z.string().optional().nullable(),
});

export const updatePreferenceSchema = createPreferenceSchema.partial();

// =============================================================================
// REACTION SCHEMAS
// =============================================================================

export const createReactionSchema = z.object({
  entityType: z.enum(["TASK", "APPROVAL", "UPDATE", "REQUEST"]),
  entityId: z.string().min(1),
  type: z.enum(["LOOKS_GOOD", "NEED_DETAILS", "PLEASE_ADJUST", "LOVE_IT", "SAVE_THIS"]),
});

// =============================================================================
// HELPER: Validate and return data or throw
// =============================================================================

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = new Error("Validation failed") as any;
    error.status = 400;
    error.errors = result.error.errors;
    throw error;
  }
  return result.data;
}

// =============================================================================
// HELPER: Validate and return result (doesn't throw)
// =============================================================================

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { 
  success: true; 
  data: T; 
} | { 
  success: false; 
  errors: z.ZodError["errors"]; 
} {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.errors };
}
