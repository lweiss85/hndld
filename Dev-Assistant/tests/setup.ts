import "@testing-library/jest-dom";
import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock window.matchMedia
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

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollTo
window.scrollTo = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
});

// MSW Server Setup for API mocking
export const handlers = [
  // Auth endpoints
  http.get("/api/auth/user", () => {
    return HttpResponse.json({
      id: "test-user-id",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
    });
  }),

  // User profile
  http.get("/api/user-profile", () => {
    return HttpResponse.json({
      id: "profile-id",
      userId: "test-user-id",
      householdId: "household-id",
      role: "CLIENT",
    });
  }),

  // Tasks
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

  // Approvals
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

  // Updates
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

  // Requests
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

  // Dashboard
  http.get("/api/dashboard", () => {
    return HttpResponse.json({
      pendingTasks: 5,
      pendingApprovals: 2,
      upcomingEvents: 3,
      recentUpdates: 4,
    });
  }),

  // Onboarding status
  http.get("/api/onboarding/status", () => {
    return HttpResponse.json({
      phase1Complete: true,
      phase2Complete: false,
      phase3Complete: false,
    });
  }),

  // Household settings
  http.get("/api/household/settings", () => {
    return HttpResponse.json({
      id: "settings-id",
      householdId: "household-id",
      timezone: "America/Chicago",
      primaryAddress: "123 Main St",
    });
  }),

  // Vendors
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

  // Spending
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

  // Calendar events
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

  // Notifications
  http.get("/api/notifications", () => {
    return HttpResponse.json([]);
  }),

  // People
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

export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Close server after all tests
afterAll(() => server.close());

// Export utilities for tests
export { server as mockServer };
