import { describe, it, expect } from "vitest";
import { z } from "zod";

// Task validation schema (extracted from shared/schema.ts pattern)
const taskStatusEnum = z.enum(["INBOX", "PLANNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "DONE", "CANCELLED"]);
const taskCategoryEnum = z.enum(["HOUSEHOLD", "ERRANDS", "MAINTENANCE", "GROCERIES", "KIDS", "PETS", "EVENTS", "OTHER"]);
const urgencyEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);
const recurrenceEnum = z.enum(["none", "daily", "weekly", "biweekly", "monthly", "custom"]);

const insertTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(5000).optional(),
  status: taskStatusEnum.default("INBOX"),
  category: taskCategoryEnum.default("OTHER"),
  urgency: urgencyEnum.default("MEDIUM"),
  dueAt: z.date().optional().nullable(),
  location: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  assignedTo: z.string().optional(),
  householdId: z.string().min(1),
  createdBy: z.string().min(1),
  recurrence: recurrenceEnum.default("none"),
  recurrenceCustomDays: z.number().int().positive().optional().nullable(),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
});

// Utility functions
function calculateNextOccurrence(
  recurrence: string,
  customDays: number | null | undefined,
  currentDueAt: Date | null | undefined
): Date | null {
  const anchor = currentDueAt ? new Date(currentDueAt) : new Date();
  
  switch (recurrence) {
    case "daily":
      return new Date(anchor.getTime() + 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(anchor.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "biweekly":
      return new Date(anchor.getTime() + 14 * 24 * 60 * 60 * 1000);
    case "monthly":
      const nextMonth = new Date(anchor);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    case "custom":
      if (customDays && customDays > 0) {
        return new Date(anchor.getTime() + customDays * 24 * 60 * 60 * 1000);
      }
      return null;
    default:
      return null;
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getTaskStatusColor(status: string): string {
  const colors: Record<string, string> = {
    INBOX: "bg-gray-100 text-gray-800",
    PLANNED: "bg-blue-100 text-blue-800",
    IN_PROGRESS: "bg-yellow-100 text-yellow-800",
    WAITING_ON_CLIENT: "bg-purple-100 text-purple-800",
    DONE: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

function getUrgencyIcon(urgency: string): string {
  const icons: Record<string, string> = {
    LOW: "🟢",
    MEDIUM: "🟡",
    HIGH: "🔴",
  };
  return icons[urgency] || "🟡";
}

describe("Task Validation Schema", () => {
  it("validates a valid task", () => {
    const validTask = {
      title: "Pick up dry cleaning",
      category: "ERRANDS",
      urgency: "MEDIUM",
      status: "INBOX",
      householdId: "household-123",
      createdBy: "user-456",
    };

    const result = insertTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it("rejects task without title", () => {
    const invalidTask = {
      category: "ERRANDS",
      householdId: "household-123",
      createdBy: "user-456",
    };

    const result = insertTaskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
  });

  it("rejects task with empty title", () => {
    const invalidTask = {
      title: "",
      householdId: "household-123",
      createdBy: "user-456",
    };

    const result = insertTaskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const invalidTask = {
      title: "Test task",
      status: "INVALID_STATUS",
      householdId: "household-123",
      createdBy: "user-456",
    };

    const result = insertTaskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
  });

  it("applies default values", () => {
    const minimalTask = {
      title: "Test task",
      householdId: "household-123",
      createdBy: "user-456",
    };

    const result = insertTaskSchema.parse(minimalTask);
    expect(result.status).toBe("INBOX");
    expect(result.category).toBe("OTHER");
    expect(result.urgency).toBe("MEDIUM");
    expect(result.recurrence).toBe("none");
  });

  it("validates all status values", () => {
    const statuses = ["INBOX", "PLANNED", "IN_PROGRESS", "WAITING_ON_CLIENT", "DONE", "CANCELLED"];
    
    statuses.forEach((status) => {
      const task = {
        title: "Test task",
        status,
        householdId: "household-123",
        createdBy: "user-456",
      };
      
      const result = insertTaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });
  });

  it("validates all category values", () => {
    const categories = ["HOUSEHOLD", "ERRANDS", "MAINTENANCE", "GROCERIES", "KIDS", "PETS", "EVENTS", "OTHER"];
    
    categories.forEach((category) => {
      const task = {
        title: "Test task",
        category,
        householdId: "household-123",
        createdBy: "user-456",
      };
      
      const result = insertTaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });
  });
});

describe("calculateNextOccurrence", () => {
  const baseDate = new Date("2025-01-15T10:00:00Z");

  it("calculates daily recurrence", () => {
    const result = calculateNextOccurrence("daily", null, baseDate);
    expect(result?.getDate()).toBe(16);
  });

  it("calculates weekly recurrence", () => {
    const result = calculateNextOccurrence("weekly", null, baseDate);
    expect(result?.getDate()).toBe(22);
  });

  it("calculates biweekly recurrence", () => {
    const result = calculateNextOccurrence("biweekly", null, baseDate);
    expect(result?.getDate()).toBe(29);
  });

  it("calculates monthly recurrence", () => {
    const result = calculateNextOccurrence("monthly", null, baseDate);
    expect(result?.getMonth()).toBe(1); // February
  });

  it("calculates custom recurrence with valid days", () => {
    const result = calculateNextOccurrence("custom", 5, baseDate);
    expect(result?.getDate()).toBe(20);
  });

  it("returns null for custom recurrence without days", () => {
    const result = calculateNextOccurrence("custom", null, baseDate);
    expect(result).toBeNull();
  });

  it("returns null for none recurrence", () => {
    const result = calculateNextOccurrence("none", null, baseDate);
    expect(result).toBeNull();
  });

  it("uses current date when no due date provided", () => {
    const result = calculateNextOccurrence("daily", null, null);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("formatCurrency", () => {
  it("formats cents to dollars", () => {
    expect(formatCurrency(10000)).toBe("$100.00");
    expect(formatCurrency(1500)).toBe("$15.00");
    expect(formatCurrency(99)).toBe("$0.99");
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles large amounts", () => {
    expect(formatCurrency(1000000)).toBe("$10,000.00");
    expect(formatCurrency(12345678)).toBe("$123,456.78");
  });

  it("handles negative amounts", () => {
    expect(formatCurrency(-500)).toBe("-$5.00");
  });
});

describe("getTaskStatusColor", () => {
  it("returns correct color for each status", () => {
    expect(getTaskStatusColor("INBOX")).toContain("gray");
    expect(getTaskStatusColor("PLANNED")).toContain("blue");
    expect(getTaskStatusColor("IN_PROGRESS")).toContain("yellow");
    expect(getTaskStatusColor("WAITING_ON_CLIENT")).toContain("purple");
    expect(getTaskStatusColor("DONE")).toContain("green");
    expect(getTaskStatusColor("CANCELLED")).toContain("red");
  });

  it("returns default color for unknown status", () => {
    expect(getTaskStatusColor("UNKNOWN")).toContain("gray");
  });
});

describe("getUrgencyIcon", () => {
  it("returns correct icon for each urgency", () => {
    expect(getUrgencyIcon("LOW")).toBe("🟢");
    expect(getUrgencyIcon("MEDIUM")).toBe("🟡");
    expect(getUrgencyIcon("HIGH")).toBe("🔴");
  });

  it("returns default icon for unknown urgency", () => {
    expect(getUrgencyIcon("UNKNOWN")).toBe("🟡");
  });
});
