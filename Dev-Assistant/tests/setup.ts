import { afterEach, beforeAll, afterAll, vi } from "vitest";

const isBrowser = typeof window !== "undefined";

if (isBrowser) {
  const { cleanup } = await import("@testing-library/react");
  await import("@testing-library/jest-dom");

  afterEach(() => {
    cleanup();
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  window.scrollTo = vi.fn();

  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
  });

  const sessionStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  Object.defineProperty(window, "sessionStorage", {
    value: sessionStorageMock,
  });

  const { setupServer } = await import("msw/node");
  const { http, HttpResponse } = await import("msw");

  const handlers = [
    http.get("/api/auth/user", () => {
      return HttpResponse.json({
        id: "test-user-id",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
      });
    }),

    http.get("/api/user-profile", () => {
      return HttpResponse.json({
        id: "profile-id",
        userId: "test-user-id",
        householdId: "household-id",
        role: "CLIENT",
      });
    }),

    http.get("/api/tasks", () => {
      return HttpResponse.json([
        {
          id: "task-1",
          title: "Test Task 1",
          status: "INBOX",
          category: "HOUSEHOLD",
          urgency: "MEDIUM",
          householdId: "household-id",
          createdBy: "test-user-id",
          createdAt: new Date().toISOString(),
        },
        {
          id: "task-2",
          title: "Test Task 2",
          status: "PLANNED",
          category: "ERRANDS",
          urgency: "HIGH",
          householdId: "household-id",
          createdBy: "test-user-id",
          createdAt: new Date().toISOString(),
        },
      ]);
    }),

    http.post("/api/tasks", async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({
        id: "new-task-id",
        ...body,
        createdAt: new Date().toISOString(),
      });
    }),

    http.patch("/api/tasks/:id", async ({ params, request }) => {
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({
        id: params.id,
        ...body,
        updatedAt: new Date().toISOString(),
      });
    }),

    http.delete("/api/tasks/:id", () => {
      return HttpResponse.json({ success: true });
    }),

    http.get("/api/approvals", () => {
      return HttpResponse.json([
        {
          id: "approval-1",
          title: "Test Approval",
          status: "PENDING",
          amount: 10000,
          householdId: "household-id",
          createdAt: new Date().toISOString(),
        },
      ]);
    }),

    http.get("/api/updates", () => {
      return HttpResponse.json([
        {
          id: "update-1",
          text: "Test update message",
          householdId: "household-id",
          createdAt: new Date().toISOString(),
        },
      ]);
    }),

    http.get("/api/requests", () => {
      return HttpResponse.json([
        {
          id: "request-1",
          title: "Test Request",
          status: "PENDING",
          householdId: "household-id",
          createdAt: new Date().toISOString(),
        },
      ]);
    }),

    http.get("/api/dashboard", () => {
      return HttpResponse.json({
        pendingTasks: 5,
        pendingApprovals: 2,
        upcomingEvents: 3,
        recentUpdates: 4,
      });
    }),

    http.get("/api/onboarding/status", () => {
      return HttpResponse.json({
        phase1Complete: true,
        phase2Complete: false,
        phase3Complete: false,
      });
    }),

    http.get("/api/household/settings", () => {
      return HttpResponse.json({
        id: "settings-id",
        householdId: "household-id",
        timezone: "America/Chicago",
        primaryAddress: "123 Main St",
      });
    }),

    http.get("/api/vendors", () => {
      return HttpResponse.json([
        {
          id: "vendor-1",
          name: "Test Vendor",
          category: "Plumber",
          phone: "555-1234",
          householdId: "household-id",
        },
      ]);
    }),

    http.get("/api/spending", () => {
      return HttpResponse.json([
        {
          id: "spending-1",
          amount: 5000,
          category: "Groceries",
          vendor: "Whole Foods",
          householdId: "household-id",
          createdAt: new Date().toISOString(),
        },
      ]);
    }),

    http.get("/api/calendar-events", () => {
      return HttpResponse.json([
        {
          id: "event-1",
          title: "Test Event",
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 3600000).toISOString(),
          householdId: "household-id",
        },
      ]);
    }),

    http.get("/api/notifications", () => {
      return HttpResponse.json([]);
    }),

    http.get("/api/people", () => {
      return HttpResponse.json([
        {
          id: "person-1",
          fullName: "John Doe",
          preferredName: "John",
          role: "PARENT",
          householdId: "household-id",
        },
      ]);
    }),
  ];

  const server = setupServer(...handlers);

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

afterEach(() => {
  vi.clearAllMocks();
});
