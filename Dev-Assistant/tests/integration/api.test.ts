import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// API client simulation
const apiClient = {
  baseUrl: "http://localhost:5000",
  
  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  
  async post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  
  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  
  async delete(endpoint: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },
};

// Test data
const mockTasks = [
  {
    id: "task-1",
    title: "Pick up dry cleaning",
    status: "INBOX",
    category: "ERRANDS",
    urgency: "MEDIUM",
    householdId: "household-1",
    createdBy: "user-1",
    createdAt: "2025-01-15T10:00:00Z",
  },
  {
    id: "task-2",
    title: "Schedule HVAC maintenance",
    status: "PLANNED",
    category: "MAINTENANCE",
    urgency: "LOW",
    householdId: "household-1",
    createdBy: "user-1",
    createdAt: "2025-01-15T11:00:00Z",
  },
];

const mockApprovals = [
  {
    id: "approval-1",
    title: "New dishwasher purchase",
    details: "Current one is leaking",
    amount: 89900,
    status: "PENDING",
    householdId: "household-1",
    createdBy: "user-1",
    createdAt: "2025-01-15T10:00:00Z",
  },
];

const mockVendors = [
  {
    id: "vendor-1",
    name: "ABC Plumbing",
    phone: "(555) 123-4567",
    email: "info@abcplumbing.com",
    category: "Plumber",
    householdId: "household-1",
  },
];

// MSW handlers for integration tests
const handlers = [
  // Tasks
  http.get("http://localhost:5000/api/tasks", () => {
    return HttpResponse.json(mockTasks);
  }),
  
  http.get("http://localhost:5000/api/tasks/:id", ({ params }) => {
    const task = mockTasks.find((t) => t.id === params.id);
    if (!task) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(task);
  }),
  
  http.post("http://localhost:5000/api/tasks", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newTask = {
      id: `task-${Date.now()}`,
      ...body,
      createdAt: new Date().toISOString(),
    };
    return HttpResponse.json(newTask, { status: 201 });
  }),
  
  http.patch("http://localhost:5000/api/tasks/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const task = mockTasks.find((t) => t.id === params.id);
    if (!task) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ ...task, ...body, updatedAt: new Date().toISOString() });
  }),
  
  http.delete("http://localhost:5000/api/tasks/:id", ({ params }) => {
    const taskIndex = mockTasks.findIndex((t) => t.id === params.id);
    if (taskIndex === -1) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ success: true });
  }),
  
  http.post("http://localhost:5000/api/tasks/:id/complete", ({ params }) => {
    const task = mockTasks.find((t) => t.id === params.id);
    if (!task) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ ...task, status: "DONE", completedAt: new Date().toISOString() });
  }),
  
  // Approvals
  http.get("http://localhost:5000/api/approvals", () => {
    return HttpResponse.json(mockApprovals);
  }),
  
  http.patch("http://localhost:5000/api/approvals/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const approval = mockApprovals.find((a) => a.id === params.id);
    if (!approval) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ ...approval, ...body });
  }),
  
  // Vendors
  http.get("http://localhost:5000/api/vendors", () => {
    return HttpResponse.json(mockVendors);
  }),
  
  http.post("http://localhost:5000/api/vendors", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newVendor = {
      id: `vendor-${Date.now()}`,
      ...body,
      createdAt: new Date().toISOString(),
    };
    return HttpResponse.json(newVendor, { status: 201 });
  }),
  
  // Dashboard
  http.get("http://localhost:5000/api/dashboard", () => {
    return HttpResponse.json({
      pendingTasks: mockTasks.filter((t) => t.status !== "DONE").length,
      pendingApprovals: mockApprovals.filter((a) => a.status === "PENDING").length,
      upcomingEvents: 3,
      recentUpdates: 5,
    });
  }),
  
  // Household settings
  http.get("http://localhost:5000/api/household/settings", () => {
    return HttpResponse.json({
      id: "settings-1",
      householdId: "household-1",
      timezone: "America/Chicago",
      primaryAddress: "123 Oak Street, Chicago, IL 60601",
      quietHoursStart: "21:00",
      quietHoursEnd: "07:00",
      approvalThreshold: 10000,
    });
  }),
  
  http.put("http://localhost:5000/api/household/settings", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: "settings-1",
      householdId: "household-1",
      ...body,
      updatedAt: new Date().toISOString(),
    });
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Tasks API", () => {
  it("fetches all tasks", async () => {
    const tasks = await apiClient.get<typeof mockTasks>("/api/tasks");
    
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe("Pick up dry cleaning");
  });

  it("creates a new task", async () => {
    const newTask = {
      title: "Buy groceries",
      category: "GROCERIES",
      urgency: "HIGH",
      householdId: "household-1",
      createdBy: "user-1",
    };
    
    const created = await apiClient.post<typeof mockTasks[0]>("/api/tasks", newTask);
    
    expect(created.id).toBeDefined();
    expect(created.title).toBe("Buy groceries");
    expect(created.createdAt).toBeDefined();
  });

  it("updates a task", async () => {
    const updated = await apiClient.patch<typeof mockTasks[0]>("/api/tasks/task-1", {
      status: "IN_PROGRESS",
    });
    
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.updatedAt).toBeDefined();
  });

  it("deletes a task", async () => {
    await expect(apiClient.delete("/api/tasks/task-1")).resolves.toBeUndefined();
  });

  it("completes a task", async () => {
    const completed = await apiClient.post<typeof mockTasks[0]>("/api/tasks/task-1/complete", {});
    
    expect(completed.status).toBe("DONE");
    expect(completed.completedAt).toBeDefined();
  });

  it("returns 404 for non-existent task", async () => {
    await expect(apiClient.get("/api/tasks/non-existent")).rejects.toThrow("HTTP 404");
  });
});

describe("Approvals API", () => {
  it("fetches all approvals", async () => {
    const approvals = await apiClient.get<typeof mockApprovals>("/api/approvals");
    
    expect(approvals).toHaveLength(1);
    expect(approvals[0].title).toBe("New dishwasher purchase");
    expect(approvals[0].amount).toBe(89900);
  });

  it("approves an approval", async () => {
    const approved = await apiClient.patch<typeof mockApprovals[0]>("/api/approvals/approval-1", {
      status: "APPROVED",
    });
    
    expect(approved.status).toBe("APPROVED");
  });

  it("declines an approval", async () => {
    const declined = await apiClient.patch<typeof mockApprovals[0]>("/api/approvals/approval-1", {
      status: "DECLINED",
    });
    
    expect(declined.status).toBe("DECLINED");
  });
});

describe("Vendors API", () => {
  it("fetches all vendors", async () => {
    const vendors = await apiClient.get<typeof mockVendors>("/api/vendors");
    
    expect(vendors).toHaveLength(1);
    expect(vendors[0].name).toBe("ABC Plumbing");
  });

  it("creates a new vendor", async () => {
    const newVendor = {
      name: "Green Lawn Care",
      phone: "(555) 234-5678",
      category: "Landscaping",
      householdId: "household-1",
    };
    
    const created = await apiClient.post<typeof mockVendors[0]>("/api/vendors", newVendor);
    
    expect(created.id).toBeDefined();
    expect(created.name).toBe("Green Lawn Care");
  });
});

describe("Dashboard API", () => {
  it("fetches dashboard summary", async () => {
    const dashboard = await apiClient.get<{
      pendingTasks: number;
      pendingApprovals: number;
      upcomingEvents: number;
      recentUpdates: number;
    }>("/api/dashboard");
    
    expect(dashboard.pendingTasks).toBe(2);
    expect(dashboard.pendingApprovals).toBe(1);
    expect(dashboard.upcomingEvents).toBe(3);
    expect(dashboard.recentUpdates).toBe(5);
  });
});

describe("Household Settings API", () => {
  it("fetches household settings", async () => {
    const settings = await apiClient.get<{
      timezone: string;
      primaryAddress: string;
      approvalThreshold: number;
    }>("/api/household/settings");
    
    expect(settings.timezone).toBe("America/Chicago");
    expect(settings.primaryAddress).toContain("Chicago");
    expect(settings.approvalThreshold).toBe(10000);
  });

  it("updates household settings", async () => {
    const updated = await apiClient.patch<{
      timezone: string;
      approvalThreshold: number;
    }>("/api/household/settings", {
      approvalThreshold: 20000,
    });
    
    expect(updated.approvalThreshold).toBe(20000);
  });
});
