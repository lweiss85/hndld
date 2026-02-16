import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@shared/schema", () => ({
  subscriptions: { organizationId: "organizationId", stripeCustomerId: "stripeCustomerId", stripeSubscriptionId: "stripeSubscriptionId" },
  paymentMethods: {},
  invoices: { organizationId: "organizationId", stripeInvoiceId: "stripeInvoiceId", createdAt: "createdAt" },
  organizations: { id: "id" },
}));

import {
  getPlanById,
  isDemoMode,
  SUBSCRIPTION_PLANS,
  canAccessFeature,
  getSubscription,
  getInvoices,
  createCheckoutSession,
} from "../../server/services/billing";
import { db } from "../../server/db";

describe("Billing Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SUBSCRIPTION_PLANS", () => {
    it("contains 6 plans", () => {
      expect(SUBSCRIPTION_PLANS).toHaveLength(6);
    });

    it("includes FREE, HOUSEHOLD_BASIC, HOUSEHOLD_PREMIUM, PRO_STARTER, PRO_GROWTH, ENTERPRISE", () => {
      const ids = SUBSCRIPTION_PLANS.map((p) => p.id);
      expect(ids).toEqual([
        "FREE",
        "HOUSEHOLD_BASIC",
        "HOUSEHOLD_PREMIUM",
        "PRO_STARTER",
        "PRO_GROWTH",
        "ENTERPRISE",
      ]);
    });

    it("FREE plan has price 0", () => {
      const free = SUBSCRIPTION_PLANS.find((p) => p.id === "FREE");
      expect(free?.price).toBe(0);
    });

    it("HOUSEHOLD_PREMIUM is recommended", () => {
      const premium = SUBSCRIPTION_PLANS.find((p) => p.id === "HOUSEHOLD_PREMIUM");
      expect(premium?.recommended).toBe(true);
    });

    it("all plans have valid household limits and seat counts", () => {
      for (const plan of SUBSCRIPTION_PLANS) {
        expect(plan.householdLimit).toBeGreaterThan(0);
        expect(plan.seats).toBeGreaterThan(0);
        expect(plan.features.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getPlanById", () => {
    it("returns plan for valid ID", () => {
      const plan = getPlanById("FREE");
      expect(plan).toBeDefined();
      expect(plan?.name).toBe("Free");
    });

    it("returns undefined for invalid ID", () => {
      expect(getPlanById("NONEXISTENT")).toBeUndefined();
    });

    it("returns correct plan details for PRO_GROWTH", () => {
      const plan = getPlanById("PRO_GROWTH");
      expect(plan?.price).toBe(39900);
      expect(plan?.householdLimit).toBe(10);
      expect(plan?.seats).toBe(15);
    });
  });

  describe("isDemoMode", () => {
    it("returns true when STRIPE_SECRET_KEY is not set", () => {
      expect(isDemoMode()).toBe(true);
    });
  });

  describe("canAccessFeature", () => {
    it("denies analytics for FREE plan", () => {
      expect(canAccessFeature({ plan: "FREE" }, "analytics")).toBe(false);
    });

    it("denies analytics for HOUSEHOLD_BASIC", () => {
      expect(canAccessFeature({ plan: "HOUSEHOLD_BASIC" }, "analytics")).toBe(false);
    });

    it("allows analytics for PRO_STARTER", () => {
      expect(canAccessFeature({ plan: "PRO_STARTER" }, "analytics")).toBe(true);
    });

    it("allows AI for HOUSEHOLD_PREMIUM", () => {
      expect(canAccessFeature({ plan: "HOUSEHOLD_PREMIUM" }, "ai")).toBe(true);
    });

    it("denies AI for FREE", () => {
      expect(canAccessFeature({ plan: "FREE" }, "ai")).toBe(false);
    });

    it("allows playbooks for PRO_GROWTH", () => {
      expect(canAccessFeature({ plan: "PRO_GROWTH" }, "playbooks")).toBe(true);
    });

    it("allows whiteLabel only for PRO_GROWTH and ENTERPRISE", () => {
      expect(canAccessFeature({ plan: "PRO_STARTER" }, "whiteLabel")).toBe(false);
      expect(canAccessFeature({ plan: "PRO_GROWTH" }, "whiteLabel")).toBe(true);
      expect(canAccessFeature({ plan: "ENTERPRISE" }, "whiteLabel")).toBe(true);
    });

    it("allows integrations for HOUSEHOLD_PREMIUM+", () => {
      expect(canAccessFeature({ plan: "HOUSEHOLD_BASIC" }, "integrations")).toBe(false);
      expect(canAccessFeature({ plan: "HOUSEHOLD_PREMIUM" }, "integrations")).toBe(true);
    });

    it("ENTERPRISE has access to all features", () => {
      const features = ["analytics", "ai", "playbooks", "api", "whiteLabel", "integrations"] as const;
      for (const feature of features) {
        expect(canAccessFeature({ plan: "ENTERPRISE" }, feature)).toBe(true);
      }
    });

    it("returns false for unknown feature", () => {
      expect(canAccessFeature({ plan: "ENTERPRISE" }, "unknownFeature" as any)).toBe(false);
    });
  });

  describe("getSubscription", () => {
    it("returns FREE defaults when no subscription exists", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const sub = await getSubscription("org-123");
      expect(sub.plan).toBe("FREE");
      expect(sub.status).toBe("ACTIVE");
      expect(sub.seats).toBe(1);
      expect(sub.householdLimit).toBe(1);
    });

    it("returns existing subscription when found", async () => {
      const mockSub = {
        id: "sub-1",
        organizationId: "org-123",
        plan: "HOUSEHOLD_PREMIUM",
        status: "ACTIVE",
        seats: 5,
        householdLimit: 1,
      };
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockSub]),
        }),
      });

      const sub = await getSubscription("org-123");
      expect(sub.plan).toBe("HOUSEHOLD_PREMIUM");
      expect(sub.seats).toBe(5);
    });
  });

  describe("getInvoices", () => {
    it("returns demo invoices in demo mode", async () => {
      const invoiceList = await getInvoices("org-123");
      expect(invoiceList).toHaveLength(2);
      expect(invoiceList[0].status).toBe("PAID");
      expect(invoiceList[0].amount).toBe(7900);
    });
  });

  describe("createCheckoutSession", () => {
    it("returns demo URL in demo mode", async () => {
      const result = await createCheckoutSession(
        "org-123",
        "HOUSEHOLD_PREMIUM",
        "https://example.com/success",
        "https://example.com/cancel"
      );
      expect(result.url).toContain("success");
      expect(result.url).toContain("demo=true");
      expect(result.url).toContain("plan=HOUSEHOLD_PREMIUM");
      expect(result.sessionId).toContain("demo_session_");
    });
  });
});
