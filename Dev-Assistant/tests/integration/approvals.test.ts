import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const mockStorage = {
  getApprovals: vi.fn(),
  getApproval: vi.fn(),
  createApproval: vi.fn(),
  updateApproval: vi.fn(),
  getComments: vi.fn(),
  getTasks: vi.fn(),
};

function createTestApp(role = "ASSISTANT") {
  const app = express();
  app.use(express.json());

  const authenticate = (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { claims: { sub: "user-1" } };
    next();
  };

  const householdCtx = (req: Request, _res: Response, next: NextFunction) => {
    (req as any).householdId = "household-1";
    (req as any).householdRole = role;
    next();
  };

  app.get("/api/approvals", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userRole = (req as any).householdRole;
      const userId = (req as any).user.claims.sub;
      const serviceType = req.query.serviceType as string | undefined;

      let approvals = await mockStorage.getApprovals(householdId);

      if (userRole === "STAFF") {
        const myTasks = await mockStorage.getTasks(householdId);
        const myTaskIds = new Set(myTasks.filter((t: any) => t.assignedTo === userId).map((t: any) => t.id));
        approvals = approvals.filter((a: any) =>
          a.createdBy === userId || (a.relatedTaskId && myTaskIds.has(a.relatedTaskId))
        );
        approvals = approvals.filter((a: any) => a.serviceType === "CLEANING");
      } else if (serviceType && ["CLEANING", "PA"].includes(serviceType)) {
        approvals = approvals.filter((a: any) => a.serviceType === serviceType);
      }

      const approvalsWithComments = await Promise.all(
        approvals.map(async (approval: any) => {
          const comments = await mockStorage.getComments("APPROVAL", approval.id);
          return { ...approval, comments };
        })
      );

      res.json(approvalsWithComments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch approvals" });
    }
  });

  app.post("/api/approvals", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.claims.sub;
      const householdId = (req as any).householdId;

      const approval = await mockStorage.createApproval({
        ...req.body,
        createdBy: userId,
        householdId,
      });
      res.status(201).json(approval);
    } catch (error) {
      res.status(500).json({ message: "Failed to create approval" });
    }
  });

  app.patch("/api/approvals/:id", authenticate, householdCtx, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.claims.sub;
      const householdId = (req as any).householdId;
      const userRole = (req as any).householdRole;

      if (userRole === "STAFF") {
        const existing = await mockStorage.getApproval(householdId, req.params.id);
        if (!existing) return res.status(404).json({ message: "Approval not found" });

        let hasAccess = existing.createdBy === userId;
        if (!hasAccess && existing.relatedTaskId) {
          const myTasks = await mockStorage.getTasks(householdId);
          const myTaskIds = new Set(myTasks.filter((t: any) => t.assignedTo === userId).map((t: any) => t.id));
          hasAccess = myTaskIds.has(existing.relatedTaskId);
        }

        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const approval = await mockStorage.updateApproval(householdId, req.params.id, req.body);
      if (!approval) return res.status(404).json({ message: "Approval not found" });

      res.json(approval);
    } catch (error) {
      res.status(500).json({ message: "Failed to update approval" });
    }
  });

  return app;
}

describe("Approvals Integration Tests", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp("ASSISTANT");
    mockStorage.getComments.mockResolvedValue([]);
  });

  describe("GET /api/approvals", () => {
    it("returns all approvals for household", async () => {
      const approvals = [
        { id: "a1", title: "Buy new rug", status: "PENDING", amount: 50000, householdId: "household-1", serviceType: "PA" },
        { id: "a2", title: "Deep clean", status: "APPROVED", amount: 15000, householdId: "household-1", serviceType: "CLEANING" },
      ];
      mockStorage.getApprovals.mockResolvedValue(approvals);

      const res = await request(app).get("/api/approvals");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty("comments");
    });

    it("filters by serviceType when provided", async () => {
      const approvals = [
        { id: "a1", title: "PA task", serviceType: "PA", status: "PENDING" },
        { id: "a2", title: "Cleaning task", serviceType: "CLEANING", status: "PENDING" },
      ];
      mockStorage.getApprovals.mockResolvedValue(approvals);

      const res = await request(app).get("/api/approvals?serviceType=CLEANING");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].serviceType).toBe("CLEANING");
    });

    it("includes comments with each approval", async () => {
      const approvals = [{ id: "a1", title: "Test", status: "PENDING" }];
      mockStorage.getApprovals.mockResolvedValue(approvals);
      mockStorage.getComments.mockResolvedValue([
        { id: "c1", text: "Looks good", createdBy: "user-2" },
      ]);

      const res = await request(app).get("/api/approvals");

      expect(res.body[0].comments).toHaveLength(1);
      expect(res.body[0].comments[0].text).toBe("Looks good");
    });
  });

  describe("GET /api/approvals (STAFF role)", () => {
    it("only shows CLEANING approvals for staff", async () => {
      const staffApp = createTestApp("STAFF");
      mockStorage.getComments.mockResolvedValue([]);
      const approvals = [
        { id: "a1", title: "PA task", serviceType: "PA", status: "PENDING", createdBy: "user-1" },
        { id: "a2", title: "Clean task", serviceType: "CLEANING", status: "PENDING", createdBy: "user-1" },
      ];
      mockStorage.getApprovals.mockResolvedValue(approvals);
      mockStorage.getTasks.mockResolvedValue([]);

      const res = await request(staffApp).get("/api/approvals");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].serviceType).toBe("CLEANING");
    });
  });

  describe("POST /api/approvals", () => {
    it("creates a new approval", async () => {
      const newApproval = {
        title: "New curtains",
        description: "Need approval for living room curtains",
        amount: 35000,
      };
      const created = {
        id: "a-new",
        ...newApproval,
        status: "PENDING",
        createdBy: "user-1",
        householdId: "household-1",
      };
      mockStorage.createApproval.mockResolvedValue(created);

      const res = await request(app).post("/api/approvals").send(newApproval);

      expect(res.status).toBe(201);
      expect(res.body.title).toBe("New curtains");
      expect(res.body.createdBy).toBe("user-1");
      expect(mockStorage.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New curtains",
          createdBy: "user-1",
          householdId: "household-1",
        })
      );
    });
  });

  describe("PATCH /api/approvals/:id", () => {
    it("approves a pending approval", async () => {
      const updated = {
        id: "a1",
        title: "Buy rug",
        status: "APPROVED",
        approvedBy: "user-1",
      };
      mockStorage.updateApproval.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/api/approvals/a1")
        .send({ status: "APPROVED" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
    });

    it("rejects an approval", async () => {
      const updated = { id: "a1", status: "DECLINED" };
      mockStorage.updateApproval.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/api/approvals/a1")
        .send({ status: "DECLINED" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("DECLINED");
    });

    it("returns 404 for nonexistent approval", async () => {
      mockStorage.updateApproval.mockResolvedValue(null);

      const res = await request(app)
        .patch("/api/approvals/nonexistent")
        .send({ status: "APPROVED" });

      expect(res.status).toBe(404);
    });

    it("denies STAFF access to unrelated approval", async () => {
      const staffApp = createTestApp("STAFF");
      mockStorage.getApproval.mockResolvedValue({
        id: "a1",
        createdBy: "other-user",
        relatedTaskId: null,
      });
      mockStorage.getTasks.mockResolvedValue([]);

      const res = await request(staffApp)
        .patch("/api/approvals/a1")
        .send({ status: "APPROVED" });

      expect(res.status).toBe(403);
    });

    it("allows STAFF to update own approval", async () => {
      const staffApp = createTestApp("STAFF");
      mockStorage.getApproval.mockResolvedValue({
        id: "a1",
        createdBy: "user-1",
      });
      mockStorage.updateApproval.mockResolvedValue({ id: "a1", status: "APPROVED" });

      const res = await request(staffApp)
        .patch("/api/approvals/a1")
        .send({ status: "APPROVED" });

      expect(res.status).toBe(200);
    });
  });
});
