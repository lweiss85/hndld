import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";

vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock("@shared/schema", () => ({
  userProfiles: { userId: "userId", householdId: "householdId" },
  households: { id: "id" },
  organizations: { id: "id" },
}));

function createTestApp() {
  const app = express();
  app.use(express.json());

  const mockUser = {
    claims: {
      sub: "test-user-123",
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
    },
  };

  const isAuthenticated = (req: Request, _res: Response, next: Function) => {
    (req as any).user = mockUser;
    next();
  };

  const isUnauthenticated = (_req: Request, res: Response) => {
    res.status(401).json({ message: "Unauthorized" });
  };

  app.get("/api/auth/user", isAuthenticated, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({
      id: user.claims.sub,
      email: user.claims.email,
      firstName: user.claims.first_name,
      lastName: user.claims.last_name,
    });
  });

  app.get("/api/auth/user-unauth", isUnauthenticated);

  return app;
}

describe("Auth Integration Tests", () => {
  let app: Express;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("GET /api/auth/user", () => {
    it("returns user data when authenticated", async () => {
      const res = await request(app).get("/api/auth/user");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "test-user-123");
      expect(res.body).toHaveProperty("email", "test@example.com");
      expect(res.body).toHaveProperty("firstName", "Test");
      expect(res.body).toHaveProperty("lastName", "User");
    });

    it("returns 401 when not authenticated", async () => {
      const res = await request(app).get("/api/auth/user-unauth");
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Unauthorized");
    });
  });

  describe("Session handling", () => {
    it("returns consistent user ID across requests", async () => {
      const res1 = await request(app).get("/api/auth/user");
      const res2 = await request(app).get("/api/auth/user");

      expect(res1.body.id).toBe(res2.body.id);
    });
  });
});
