import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([{ id: "brief-1" }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
  return { db: mockDb };
});

vi.mock("@shared/schema", () => ({
  weeklyBriefs: { id: "id", userId: "userId", householdId: "householdId", weekStartDate: "weekStartDate", createdAt: "createdAt" },
  userEngagement: { userId: "userId", entityType: "entityType", createdAt: "createdAt" },
  learnedPreferences: {
    householdId: "householdId",
    category: "category",
    key: "key",
    useCount: { sql: "use_count" },
  },
  tasks: { id: "id", householdId: "householdId", status: "status", category: "category" },
  calendarEvents: { householdId: "householdId", startAt: "startAt" },
  approvals: { householdId: "householdId", status: "status" },
  importantDates: { householdId: "householdId" },
  people: { householdId: "householdId" },
  userProfiles: {},
  notifications: {},
  notificationSettings: { userId: "userId", householdId: "householdId", weeklyBriefDay: "weeklyBriefDay", weeklyBriefTime: "weeklyBriefTime" },
  households: { id: "id" },
}));

vi.mock("../../server/services/ai-provider", () => ({
  generateCompletion: vi.fn().mockResolvedValue("Your week looks productive! 3 tasks need attention, and don't forget the team dinner on Thursday."),
  isDemoMode: vi.fn().mockReturnValue(true),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => ({ type: "eq", args })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  gte: vi.fn((...args: any[]) => ({ type: "gte", args })),
  lte: vi.fn((...args: any[]) => ({ type: "lte", args })),
  desc: vi.fn((col: any) => ({ type: "desc", col })),
  sql: vi.fn(),
  inArray: vi.fn((...args: any[]) => ({ type: "inArray", args })),
}));

import {
  generatePersonalizedBrief,
  trackUserEngagement,
  markBriefAsRead,
  submitBriefFeedback,
  getLatestBrief,
} from "../../server/services/weekly-brief";
import { generateCompletion, isDemoMode } from "../../server/services/ai-provider";
import { db } from "../../server/db";

const mockDb = db as any;

describe("Weekly Brief Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          groupBy: vi.fn().mockResolvedValue([]),
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  describe("generatePersonalizedBrief", () => {
    function setupChainableMock(householdName = "Test Household") {
      function makeChainable(defaultResult: any[] = []): any {
        const obj: any = {
          select: vi.fn().mockImplementation(() => makeChainable(defaultResult)),
          from: vi.fn().mockImplementation(() => makeChainable(defaultResult)),
          where: vi.fn().mockImplementation(() => makeChainable(defaultResult)),
          orderBy: vi.fn().mockImplementation(() => makeChainable(defaultResult)),
          groupBy: vi.fn().mockImplementation(() => makeChainable(defaultResult)),
          limit: vi.fn().mockImplementation((n: number) => {
            if (n === 1) return Promise.resolve([{ name: householdName }]);
            return Promise.resolve(defaultResult);
          }),
          then: (resolve: any) => resolve(defaultResult),
        };
        return obj;
      }

      const chainable = makeChainable([]);
      Object.assign(mockDb, {
        select: chainable.select,
        from: chainable.from,
        where: chainable.where,
        orderBy: chainable.orderBy,
        groupBy: chainable.groupBy,
        limit: chainable.limit,
      });
    }

    it("generates a brief with content and personalization data", async () => {
      setupChainableMock();

      const result = await generatePersonalizedBrief("user-1", "household-1");

      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("personalizationData");
      expect(typeof result.content).toBe("string");
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.personalizationData).toHaveProperty("topCategories");
      expect(result.personalizationData).toHaveProperty("pendingTasks");
      expect(result.personalizationData).toHaveProperty("urgentItems");
    });

    it("uses demo mode fallback when AI is unavailable", async () => {
      (isDemoMode as any).mockReturnValue(true);
      setupChainableMock("Smith Household");

      const result = await generatePersonalizedBrief("user-1", "household-1");
      expect(result.content).toContain("Smith Household");
      expect(generateCompletion).not.toHaveBeenCalled();
    });

    it("includes default categories when no preferences exist", async () => {
      setupChainableMock();

      const result = await generatePersonalizedBrief("user-1", "household-1");
      expect(result.personalizationData.topCategories).toEqual(
        expect.arrayContaining(["HOUSEHOLD", "ERRANDS", "EVENTS"])
      );
    });
  });

  describe("trackUserEngagement", () => {
    it("inserts engagement record", async () => {
      const valuesMock = vi.fn().mockResolvedValue(undefined);
      mockDb.insert.mockReturnValue({ values: valuesMock });

      await trackUserEngagement("user-1", "household-1", "task", "task-123", "view");

      expect(mockDb.insert).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          householdId: "household-1",
          entityType: "task",
          entityId: "task-123",
          action: "view",
        })
      );
    });

    it("defaults action to 'view'", async () => {
      const valuesMock = vi.fn().mockResolvedValue(undefined);
      mockDb.insert.mockReturnValue({ values: valuesMock });

      await trackUserEngagement("user-1", "household-1", "event");

      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "view" })
      );
    });

    it("learns task category preference on task view", async () => {
      const insertValuesMock = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      });
      mockDb.insert.mockReturnValue({ values: insertValuesMock });

      const fromMock = vi.fn();
      const whereMock = vi.fn();
      mockDb.select.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ category: "HOUSEHOLD" }]),
      });

      await trackUserEngagement("user-1", "household-1", "task", "task-123", "view");

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("markBriefAsRead", () => {
    it("updates brief status to READ with timestamp", async () => {
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDb.update.mockReturnValue({ set: setMock });

      await markBriefAsRead("brief-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "READ",
          readAt: expect.any(Date),
        })
      );
    });
  });

  describe("submitBriefFeedback", () => {
    it("saves feedback rating and text", async () => {
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDb.update.mockReturnValue({ set: setMock });

      const fromMock = vi.fn();
      const whereMock = vi.fn();
      mockDb.select.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      });

      await submitBriefFeedback("brief-123", 5, "Great summary!");

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feedbackRating: 5,
          feedbackText: "Great summary!",
        })
      );
    });

    it("boosts learned preferences when rating >= 4", async () => {
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDb.update.mockReturnValue({ set: setMock });

      const fromMock = vi.fn();
      const whereMock = vi.fn();
      mockDb.select.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          {
            id: "brief-1",
            householdId: "household-1",
            topicsIncluded: ["tasks", "events"],
          },
        ]),
      });

      const valuesMock = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      });
      mockDb.insert.mockReturnValue({ values: valuesMock });

      await submitBriefFeedback("brief-1", 5, "Loved it!");

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("getLatestBrief", () => {
    it("returns null when no briefs exist", async () => {
      const fromMock = vi.fn();
      const whereMock = vi.fn();
      mockDb.select.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await getLatestBrief("user-1", "household-1");
      expect(result).toBeNull();
    });

    it("returns latest brief when one exists", async () => {
      const mockBrief = {
        id: "brief-1",
        content: "Your weekly summary",
        status: "SENT",
        userId: "user-1",
        householdId: "household-1",
      };

      const fromMock = vi.fn();
      const whereMock = vi.fn();
      mockDb.select.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockBrief]),
        }),
      });

      const result = await getLatestBrief("user-1", "household-1");
      expect(result).toEqual(mockBrief);
    });
  });
});
