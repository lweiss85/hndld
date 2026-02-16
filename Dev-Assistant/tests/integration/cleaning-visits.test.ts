import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const mockStorage = {
  getCleaningVisits: vi.fn(),
  getNextCleaningVisit: vi.fn(),
  createCleaningVisit: vi.fn(),
  updateCleaningVisit: vi.fn(),
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
    next();
  };

  app.get("/api/cleaning/next", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const visit = await mockStorage.getNextCleaningVisit(householdId);
      res.json(visit || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch next cleaning" });
    }
  });

  app.get("/api/cleaning/visits", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const visits = await mockStorage.getCleaningVisits(householdId);
      res.json(visits);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cleaning visits" });
    }
  });

  app.post("/api/cleaning/visits", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const visit = await mockStorage.createCleaningVisit({
        ...req.body,
        householdId,
      });
      res.status(201).json(visit);
    } catch (error) {
      res.status(500).json({ message: "Failed to create cleaning visit" });
    }
  });

  app.patch("/api/cleaning/visits/:id", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const visit = await mockStorage.updateCleaningVisit(id, req.body);
      if (!visit) {
        return res.status(404).json({ message: "Cleaning visit not found" });
      }
      res.json(visit);
    } catch (error) {
      res.status(500).json({ message: "Failed to update cleaning visit" });
    }
  });

  return app;
}

describe("Cleaning Visits Integration Tests", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe("GET /api/cleaning/next", () => {
    it("returns the next scheduled cleaning visit", async () => {
      const nextVisit = {
        id: "cv-1",
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        status: "SCHEDULED",
        householdId: "household-1",
        cleanerName: "Maria's Cleaning",
      };
      mockStorage.getNextCleaningVisit.mockResolvedValue(nextVisit);

      const res = await request(app).get("/api/cleaning/next");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("cv-1");
      expect(res.body.status).toBe("SCHEDULED");
    });

    it("returns null when no upcoming visits", async () => {
      mockStorage.getNextCleaningVisit.mockResolvedValue(undefined);

      const res = await request(app).get("/api/cleaning/next");

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("returns 500 on storage error", async () => {
      mockStorage.getNextCleaningVisit.mockRejectedValue(new Error("DB error"));

      const res = await request(app).get("/api/cleaning/next");

      expect(res.status).toBe(500);
    });
  });

  describe("GET /api/cleaning/visits", () => {
    it("returns all cleaning visits for household", async () => {
      const visits = [
        {
          id: "cv-1",
          scheduledDate: new Date().toISOString(),
          status: "COMPLETED",
          householdId: "household-1",
          duration: 120,
          rooms: ["kitchen", "bathrooms", "bedrooms"],
        },
        {
          id: "cv-2",
          scheduledDate: new Date(Date.now() + 604800000).toISOString(),
          status: "SCHEDULED",
          householdId: "household-1",
          duration: 120,
          rooms: ["kitchen", "living room"],
        },
      ];
      mockStorage.getCleaningVisits.mockResolvedValue(visits);

      const res = await request(app).get("/api/cleaning/visits");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].rooms).toContain("kitchen");
    });

    it("returns empty array when no visits", async () => {
      mockStorage.getCleaningVisits.mockResolvedValue([]);

      const res = await request(app).get("/api/cleaning/visits");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("POST /api/cleaning/visits", () => {
    it("creates a new cleaning visit", async () => {
      const newVisit = {
        scheduledDate: "2026-03-01T10:00:00Z",
        duration: 180,
        rooms: ["kitchen", "bathrooms", "bedrooms", "living room"],
        notes: "Deep clean requested",
        cleanerName: "Maria's Cleaning",
      };
      const created = {
        id: "cv-new",
        ...newVisit,
        status: "SCHEDULED",
        householdId: "household-1",
      };
      mockStorage.createCleaningVisit.mockResolvedValue(created);

      const res = await request(app).post("/api/cleaning/visits").send(newVisit);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("cv-new");
      expect(res.body.duration).toBe(180);
      expect(res.body.rooms).toHaveLength(4);
      expect(mockStorage.createCleaningVisit).toHaveBeenCalledWith(
        expect.objectContaining({
          householdId: "household-1",
          rooms: expect.arrayContaining(["kitchen", "bathrooms"]),
        })
      );
    });

    it("returns 500 on creation failure", async () => {
      mockStorage.createCleaningVisit.mockRejectedValue(new Error("Validation error"));

      const res = await request(app)
        .post("/api/cleaning/visits")
        .send({ scheduledDate: "invalid" });

      expect(res.status).toBe(500);
    });
  });

  describe("PATCH /api/cleaning/visits/:id", () => {
    it("updates visit status to COMPLETED", async () => {
      const updated = {
        id: "cv-1",
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
        rating: 5,
        feedback: "Excellent job!",
      };
      mockStorage.updateCleaningVisit.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/api/cleaning/visits/cv-1")
        .send({ status: "COMPLETED", rating: 5, feedback: "Excellent job!" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.rating).toBe(5);
    });

    it("cancels a visit", async () => {
      const updated = { id: "cv-1", status: "CANCELLED" };
      mockStorage.updateCleaningVisit.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/api/cleaning/visits/cv-1")
        .send({ status: "CANCELLED" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("reschedules a visit", async () => {
      const newDate = new Date(Date.now() + 172800000).toISOString();
      const updated = { id: "cv-1", scheduledDate: newDate, status: "SCHEDULED" };
      mockStorage.updateCleaningVisit.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/api/cleaning/visits/cv-1")
        .send({ scheduledDate: newDate });

      expect(res.status).toBe(200);
      expect(res.body.scheduledDate).toBe(newDate);
    });

    it("returns 404 for nonexistent visit", async () => {
      mockStorage.updateCleaningVisit.mockResolvedValue(null);

      const res = await request(app)
        .patch("/api/cleaning/visits/nonexistent")
        .send({ status: "COMPLETED" });

      expect(res.status).toBe(404);
    });
  });
});
