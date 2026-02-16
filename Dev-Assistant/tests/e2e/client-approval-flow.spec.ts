import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const mockStorage = {
  getApprovals: vi.fn(),
  getApproval: vi.fn(),
  createApproval: vi.fn(),
  updateApproval: vi.fn(),
  getComments: vi.fn(),
  createComment: vi.fn(),
  createNotification: vi.fn(),
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

  app.get("/api/approvals", auth, async (_req: Request, res: Response) => {
    try {
      const approvals = await mockStorage.getApprovals("household-1");
      const withComments = await Promise.all(
        approvals.map(async (a: any) => ({
          ...a,
          comments: await mockStorage.getComments("APPROVAL", a.id),
        }))
      );
      res.json(withComments);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/approvals", auth, async (req: Request, res: Response) => {
    try {
      const approval = await mockStorage.createApproval({
        ...req.body,
        createdBy: userId,
        householdId: "household-1",
        status: "PENDING",
      });
      await mockStorage.createNotification({
        type: "APPROVAL_REQUESTED",
        title: `Approval needed: ${approval.title}`,
        householdId: "household-1",
      });
      res.status(201).json(approval);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.patch("/api/approvals/:id", auth, async (req: Request, res: Response) => {
    try {
      const existing = await mockStorage.getApproval("household-1", req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });

      const updated = await mockStorage.updateApproval("household-1", req.params.id, {
        ...req.body,
        respondedBy: userId,
        respondedAt: new Date(),
      });

      if (req.body.status === "APPROVED" || req.body.status === "DECLINED") {
        await mockStorage.createNotification({
          type: "APPROVAL_RESPONDED",
          title: `Approval ${req.body.status.toLowerCase()}: ${existing.title}`,
          userId: existing.createdBy,
          householdId: "household-1",
        });
      }

      res.json(updated);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  app.post("/api/approvals/:id/comments", auth, async (req: Request, res: Response) => {
    try {
      const comment = await mockStorage.createComment({
        ...req.body,
        entityType: "APPROVAL",
        entityId: req.params.id,
        createdBy: userId,
      });
      res.status(201).json(comment);
    } catch { res.status(500).json({ message: "Error" }); }
  });

  return app;
}

describe("E2E: Client Approval Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getComments.mockResolvedValue([]);
  });

  describe("Full approval lifecycle", () => {
    it("Assistant creates approval → Client reviews → Client approves", async () => {
      const assistantApp = createApp("ASSISTANT", "assistant-1");
      const clientApp = createApp("CLIENT", "client-1");

      const approval = {
        id: "approval-1",
        title: "New kitchen appliances",
        description: "Blender and toaster for the kitchen - $180 total",
        amount: 18000,
        status: "PENDING",
        createdBy: "assistant-1",
        householdId: "household-1",
        serviceType: "PA",
      };

      mockStorage.createApproval.mockResolvedValue(approval);
      mockStorage.createNotification.mockResolvedValue({ id: "notif-1" });

      const createRes = await request(assistantApp)
        .post("/api/approvals")
        .send({
          title: "New kitchen appliances",
          description: "Blender and toaster for the kitchen - $180 total",
          amount: 18000,
          serviceType: "PA",
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("PENDING");
      expect(mockStorage.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "APPROVAL_REQUESTED" })
      );

      mockStorage.getApprovals.mockResolvedValue([approval]);
      const listRes = await request(clientApp).get("/api/approvals");

      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].title).toBe("New kitchen appliances");
      expect(listRes.body[0].amount).toBe(18000);

      const approvedApproval = { ...approval, status: "APPROVED", respondedBy: "client-1" };
      mockStorage.getApproval.mockResolvedValue(approval);
      mockStorage.updateApproval.mockResolvedValue(approvedApproval);

      const approveRes = await request(clientApp)
        .patch("/api/approvals/approval-1")
        .send({ status: "APPROVED" });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe("APPROVED");
      expect(mockStorage.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "APPROVAL_RESPONDED",
          userId: "assistant-1",
        })
      );
    });

    it("Assistant creates approval → Client declines with comment", async () => {
      const assistantApp = createApp("ASSISTANT", "assistant-1");
      const clientApp = createApp("CLIENT", "client-1");

      const approval = {
        id: "approval-2",
        title: "Premium cleaning supplies",
        amount: 25000,
        status: "PENDING",
        createdBy: "assistant-1",
        householdId: "household-1",
      };

      mockStorage.createApproval.mockResolvedValue(approval);
      mockStorage.createNotification.mockResolvedValue({ id: "n1" });

      await request(assistantApp).post("/api/approvals").send({
        title: "Premium cleaning supplies",
        amount: 25000,
      });

      mockStorage.createComment.mockResolvedValue({
        id: "comment-1",
        text: "Too expensive, please find alternatives under $150",
        createdBy: "client-1",
      });

      const commentRes = await request(clientApp)
        .post("/api/approvals/approval-2/comments")
        .send({ text: "Too expensive, please find alternatives under $150" });

      expect(commentRes.status).toBe(201);

      const declined = { ...approval, status: "DECLINED", respondedBy: "client-1" };
      mockStorage.getApproval.mockResolvedValue(approval);
      mockStorage.updateApproval.mockResolvedValue(declined);

      const declineRes = await request(clientApp)
        .patch("/api/approvals/approval-2")
        .send({ status: "DECLINED" });

      expect(declineRes.status).toBe(200);
      expect(declineRes.body.status).toBe("DECLINED");
    });
  });

  describe("Multiple approvals at once", () => {
    it("client can view and batch-respond to multiple pending approvals", async () => {
      const clientApp = createApp("CLIENT", "client-1");

      const approvals = [
        { id: "a1", title: "Groceries", amount: 8000, status: "PENDING", createdBy: "assistant-1" },
        { id: "a2", title: "Dry cleaning", amount: 4500, status: "PENDING", createdBy: "assistant-1" },
        { id: "a3", title: "New pillows", amount: 12000, status: "PENDING", createdBy: "assistant-1" },
      ];

      mockStorage.getApprovals.mockResolvedValue(approvals);

      const listRes = await request(clientApp).get("/api/approvals");
      expect(listRes.body).toHaveLength(3);

      for (const approval of approvals) {
        mockStorage.getApproval.mockResolvedValue(approval);
        mockStorage.updateApproval.mockResolvedValue({ ...approval, status: "APPROVED" });
        mockStorage.createNotification.mockResolvedValue({ id: "n" });

        const res = await request(clientApp)
          .patch(`/api/approvals/${approval.id}`)
          .send({ status: "APPROVED" });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("APPROVED");
      }

      expect(mockStorage.updateApproval).toHaveBeenCalledTimes(3);
    });
  });
});
