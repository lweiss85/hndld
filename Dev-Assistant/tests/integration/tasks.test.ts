import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const mockStorage = {
  getTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTask: vi.fn(),
  completeTask: vi.fn(),
};

function createTestApp() {
  const app = express();
  app.use(express.json());

  const authenticate = (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { claims: { sub: "user-1" } };
    next();
  };

  const householdCtx = (req: Request, _res: Response, next: NextFunction) => {
    (req as any).householdId = "household-1";
    (req as any).householdRole = "ASSISTANT";
    next();
  };

  app.get("/api/tasks", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const tasks = await mockStorage.getTasks(householdId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.claims.sub;
      const householdId = (req as any).householdId;
      const task = await mockStorage.createTask({
        ...req.body,
        createdBy: userId,
        householdId,
      });
      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const task = await mockStorage.updateTask((req as any).householdId, req.params.id, req.body);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      await mockStorage.deleteTask((req as any).householdId, req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  app.post("/api/tasks/:id/complete", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const task = await mockStorage.getTask((req as any).householdId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const updated = await mockStorage.updateTask((req as any).householdId, req.params.id, {
        status: "DONE",
        completedAt: new Date(),
        completedBy: (req as any).user.claims.sub,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to complete task" });
    }
  });

  return app;
}

describe("Tasks Integration Tests", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe("GET /api/tasks", () => {
    it("returns list of tasks for household", async () => {
      const tasks = [
        { id: "t1", title: "Buy groceries", status: "INBOX", category: "ERRANDS", householdId: "household-1" },
        { id: "t2", title: "Schedule plumber", status: "PLANNED", category: "HOUSEHOLD", householdId: "household-1" },
      ];
      mockStorage.getTasks.mockResolvedValue(tasks);

      const res = await request(app).get("/api/tasks");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe("Buy groceries");
      expect(mockStorage.getTasks).toHaveBeenCalledWith("household-1");
    });

    it("returns empty array when no tasks exist", async () => {
      mockStorage.getTasks.mockResolvedValue([]);

      const res = await request(app).get("/api/tasks");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 500 on storage error", async () => {
      mockStorage.getTasks.mockRejectedValue(new Error("DB connection failed"));

      const res = await request(app).get("/api/tasks");

      expect(res.status).toBe(500);
      expect(res.body.message).toBe("Failed to fetch tasks");
    });
  });

  describe("POST /api/tasks", () => {
    it("creates a new task", async () => {
      const newTask = {
        title: "Pick up dry cleaning",
        category: "ERRANDS",
        urgency: "MEDIUM",
      };
      const created = {
        id: "t-new",
        ...newTask,
        status: "INBOX",
        createdBy: "user-1",
        householdId: "household-1",
        createdAt: new Date().toISOString(),
      };
      mockStorage.createTask.mockResolvedValue(created);

      const res = await request(app).post("/api/tasks").send(newTask);

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("Pick up dry cleaning");
      expect(res.body.id).toBe("t-new");
      expect(mockStorage.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pick up dry cleaning",
          createdBy: "user-1",
          householdId: "household-1",
        })
      );
    });

    it("returns 500 on creation failure", async () => {
      mockStorage.createTask.mockRejectedValue(new Error("Validation failed"));

      const res = await request(app).post("/api/tasks").send({ title: "Test" });

      expect(res.status).toBe(500);
    });
  });

  describe("PATCH /api/tasks/:id", () => {
    it("updates task fields", async () => {
      const updated = {
        id: "t1",
        title: "Updated title",
        status: "PLANNED",
        householdId: "household-1",
      };
      mockStorage.updateTask.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/api/tasks/t1")
        .send({ title: "Updated title", status: "PLANNED" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated title");
    });

    it("returns 404 for nonexistent task", async () => {
      mockStorage.updateTask.mockResolvedValue(null);

      const res = await request(app)
        .patch("/api/tasks/nonexistent")
        .send({ title: "New" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/tasks/:id", () => {
    it("deletes a task", async () => {
      mockStorage.deleteTask.mockResolvedValue(undefined);

      const res = await request(app).delete("/api/tasks/t1");

      expect(res.status).toBe(204);
      expect(mockStorage.deleteTask).toHaveBeenCalledWith("household-1", "t1");
    });
  });

  describe("POST /api/tasks/:id/complete", () => {
    it("completes a task", async () => {
      const task = { id: "t1", title: "Task", status: "IN_PROGRESS" };
      const completed = { ...task, status: "DONE", completedBy: "user-1" };
      mockStorage.getTask.mockResolvedValue(task);
      mockStorage.updateTask.mockResolvedValue(completed);

      const res = await request(app).post("/api/tasks/t1/complete");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("DONE");
      expect(res.body.completedBy).toBe("user-1");
    });

    it("returns 404 for nonexistent task", async () => {
      mockStorage.getTask.mockResolvedValue(null);

      const res = await request(app).post("/api/tasks/nonexistent/complete");

      expect(res.status).toBe(404);
    });
  });
});
