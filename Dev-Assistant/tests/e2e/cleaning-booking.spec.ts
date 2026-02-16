import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const mockStorage = {
  getCleaningVisits: vi.fn(),
  getNextCleaningVisit: vi.fn(),
  createCleaningVisit: vi.fn(),
  updateCleaningVisit: vi.fn(),
  createNotification: vi.fn(),
  createApproval: vi.fn(),
};

function createApp(role: string, userId: string) {
  const app = express();
  app.use(express.json());

  const auth = (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).householdId = "household-1";
    (req as any).householdRole = role;
    next();
  };

  app.get("/api/cleaning/next", auth, async (_req: Request, res: Response) => {
    try {
      const visit = await mockStorage.getNextCleaningVisit("household-1");
      res.json(visit || null);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.get("/api/cleaning/visits", auth, async (_req: Request, res: Response) => {
    try {
      const visits = await mockStorage.getCleaningVisits("household-1");
      res.json(visits);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/cleaning/visits", auth, async (req: Request, res: Response) => {
    try {
      const visit = await mockStorage.createCleaningVisit({
        ...req.body,
        householdId: "household-1",
        createdBy: userId,
        status: "SCHEDULED",
      });

      await mockStorage.createNotification({
        type: "CLEANING_SCHEDULED",
        title: `Cleaning scheduled for ${req.body.scheduledDate}`,
        householdId: "household-1",
      });

      res.status(201).json(visit);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/cleaning/visits/:id", auth, async (req: Request, res: Response) => {
    try {
      const visit = await mockStorage.updateCleaningVisit(req.params.id, req.body);
      if (!visit) return res.status(404).json({ message: "Not found" });

      if (req.body.status === "COMPLETED") {
        await mockStorage.createNotification({
          type: "CLEANING_COMPLETED",
          title: "Cleaning completed",
          householdId: "household-1",
        });
      }

      if (req.body.status === "CANCELLED") {
        await mockStorage.createNotification({
          type: "CLEANING_CANCELLED",
          title: "Cleaning cancelled",
          householdId: "household-1",
        });
      }

      res.json(visit);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  return app;
}

describe("E2E: Cleaning Booking Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.createNotification.mockResolvedValue({ id: "notif-1" });
  });

  describe("Full booking lifecycle", () => {
    it("Schedule → Confirm → Complete → Rate", async () => {
      const assistantApp = createApp("ASSISTANT", "assistant-1");
      const clientApp = createApp("CLIENT", "client-1");

      const scheduledDate = "2026-03-15T10:00:00Z";
      const newVisit = {
        id: "cv-1",
        scheduledDate,
        duration: 180,
        rooms: ["kitchen", "bathrooms", "master bedroom", "living room"],
        notes: "Please use eco-friendly products",
        cleanerName: "Maria's Premium Cleaning",
        status: "SCHEDULED",
        householdId: "household-1",
        createdBy: "assistant-1",
      };

      mockStorage.createCleaningVisit.mockResolvedValue(newVisit);

      const createRes = await request(assistantApp)
        .post("/api/cleaning/visits")
        .send({
          scheduledDate,
          duration: 180,
          rooms: ["kitchen", "bathrooms", "master bedroom", "living room"],
          notes: "Please use eco-friendly products",
          cleanerName: "Maria's Premium Cleaning",
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("SCHEDULED");
      expect(createRes.body.rooms).toHaveLength(4);
      expect(mockStorage.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "CLEANING_SCHEDULED" })
      );

      mockStorage.getNextCleaningVisit.mockResolvedValue(newVisit);
      const nextRes = await request(clientApp).get("/api/cleaning/next");

      expect(nextRes.status).toBe(200);
      expect(nextRes.body.cleanerName).toBe("Maria's Premium Cleaning");
      expect(nextRes.body.scheduledDate).toBe(scheduledDate);

      const completedVisit = {
        ...newVisit,
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
      };
      mockStorage.updateCleaningVisit.mockResolvedValue(completedVisit);

      const completeRes = await request(assistantApp)
        .patch("/api/cleaning/visits/cv-1")
        .send({ status: "COMPLETED" });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.status).toBe("COMPLETED");
      expect(mockStorage.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "CLEANING_COMPLETED" })
      );

      const ratedVisit = { ...completedVisit, rating: 5, feedback: "Spotless!" };
      mockStorage.updateCleaningVisit.mockResolvedValue(ratedVisit);

      const rateRes = await request(clientApp)
        .patch("/api/cleaning/visits/cv-1")
        .send({ rating: 5, feedback: "Spotless!" });

      expect(rateRes.status).toBe(200);
      expect(rateRes.body.rating).toBe(5);
      expect(rateRes.body.feedback).toBe("Spotless!");
    });
  });

  describe("Cancellation flow", () => {
    it("cancels a scheduled visit and sends notification", async () => {
      const assistantApp = createApp("ASSISTANT", "assistant-1");

      const cancelledVisit = {
        id: "cv-2",
        status: "CANCELLED",
        householdId: "household-1",
      };
      mockStorage.updateCleaningVisit.mockResolvedValue(cancelledVisit);

      const res = await request(assistantApp)
        .patch("/api/cleaning/visits/cv-2")
        .send({ status: "CANCELLED" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
      expect(mockStorage.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "CLEANING_CANCELLED" })
      );
    });
  });

  describe("Rescheduling flow", () => {
    it("reschedules a visit to a new date", async () => {
      const assistantApp = createApp("ASSISTANT", "assistant-1");

      const newDate = "2026-03-20T14:00:00Z";
      const rescheduled = {
        id: "cv-3",
        scheduledDate: newDate,
        status: "SCHEDULED",
        householdId: "household-1",
      };
      mockStorage.updateCleaningVisit.mockResolvedValue(rescheduled);

      const res = await request(assistantApp)
        .patch("/api/cleaning/visits/cv-3")
        .send({ scheduledDate: newDate });

      expect(res.status).toBe(200);
      expect(res.body.scheduledDate).toBe(newDate);
    });
  });

  describe("History view", () => {
    it("client can view past and upcoming cleaning visits", async () => {
      const clientApp = createApp("CLIENT", "client-1");

      const visits = [
        { id: "cv-1", scheduledDate: "2026-02-01T10:00:00Z", status: "COMPLETED", rating: 5 },
        { id: "cv-2", scheduledDate: "2026-02-08T10:00:00Z", status: "COMPLETED", rating: 4 },
        { id: "cv-3", scheduledDate: "2026-02-15T10:00:00Z", status: "COMPLETED", rating: 5 },
        { id: "cv-4", scheduledDate: "2026-03-01T10:00:00Z", status: "SCHEDULED" },
      ];
      mockStorage.getCleaningVisits.mockResolvedValue(visits);

      const res = await request(clientApp).get("/api/cleaning/visits");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);

      const completed = res.body.filter((v: any) => v.status === "COMPLETED");
      expect(completed).toHaveLength(3);

      const upcoming = res.body.filter((v: any) => v.status === "SCHEDULED");
      expect(upcoming).toHaveLength(1);
    });
  });

  describe("Edge cases", () => {
    it("handles 404 for nonexistent visit", async () => {
      const app = createApp("ASSISTANT", "assistant-1");
      mockStorage.updateCleaningVisit.mockResolvedValue(null);

      const res = await request(app)
        .patch("/api/cleaning/visits/nonexistent")
        .send({ status: "COMPLETED" });

      expect(res.status).toBe(404);
    });

    it("handles empty visit list", async () => {
      const app = createApp("CLIENT", "client-1");
      mockStorage.getCleaningVisits.mockResolvedValue([]);

      const res = await request(app).get("/api/cleaning/visits");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
