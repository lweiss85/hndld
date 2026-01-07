import { db } from "../db";
import { subscriptions, paymentMethods, invoices, organizations } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEMO_MODE = !process.env.STRIPE_SECRET_KEY;

export interface PlanDetails {
  id: string;
  name: string;
  price: number;
  priceId?: string;
  interval: "month" | "year";
  features: string[];
  householdLimit: number;
  seats: number;
  recommended?: boolean;
}

export const SUBSCRIPTION_PLANS: PlanDetails[] = [
  {
    id: "FREE",
    name: "Free",
    price: 0,
    interval: "month",
    features: [
      "1 household",
      "1 assistant user",
      "Basic features",
      "30-day history",
    ],
    householdLimit: 1,
    seats: 1,
  },
  {
    id: "HOUSEHOLD_BASIC",
    name: "Household Basic",
    price: 2900,
    priceId: process.env.STRIPE_PRICE_HOUSEHOLD_BASIC,
    interval: "month",
    features: [
      "1 household",
      "2 users",
      "All core features",
      "Unlimited history",
      "Email support",
    ],
    householdLimit: 1,
    seats: 2,
  },
  {
    id: "HOUSEHOLD_PREMIUM",
    name: "Household Premium",
    price: 7900,
    priceId: process.env.STRIPE_PRICE_HOUSEHOLD_PREMIUM,
    interval: "month",
    features: [
      "1 household",
      "5 users",
      "Priority support",
      "AI-powered features",
      "White label emails",
      "Integrations",
    ],
    householdLimit: 1,
    seats: 5,
    recommended: true,
  },
  {
    id: "PRO_STARTER",
    name: "Pro Starter",
    price: 14900,
    priceId: process.env.STRIPE_PRICE_PRO_STARTER,
    interval: "month",
    features: [
      "Up to 3 households",
      "5 seats",
      "Playbooks library",
      "Analytics dashboard",
      "API access",
    ],
    householdLimit: 3,
    seats: 5,
  },
  {
    id: "PRO_GROWTH",
    name: "Pro Growth",
    price: 39900,
    priceId: process.env.STRIPE_PRICE_PRO_GROWTH,
    interval: "month",
    features: [
      "Up to 10 households",
      "15 seats",
      "White label",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
    ],
    householdLimit: 10,
    seats: 15,
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: 0,
    interval: "month",
    features: [
      "Unlimited households",
      "Unlimited seats",
      "Custom integrations",
      "Dedicated support",
      "SLA guarantees",
      "Custom features",
    ],
    householdLimit: 999,
    seats: 999,
  },
];

export function getPlanById(planId: string): PlanDetails | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId);
}

export function isDemoMode(): boolean {
  return DEMO_MODE;
}

export async function getSubscription(organizationId: string) {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));
  
  if (!subscription) {
    return {
      plan: "FREE" as const,
      status: "ACTIVE" as const,
      seats: 1,
      householdLimit: 1,
      demoMode: DEMO_MODE,
    };
  }
  
  return {
    ...subscription,
    demoMode: DEMO_MODE,
  };
}

export async function createOrUpdateSubscription(
  organizationId: string,
  planId: string,
  stripeData?: {
    customerId?: string;
    subscriptionId?: string;
    periodStart?: Date;
    periodEnd?: Date;
  }
) {
  const plan = getPlanById(planId);
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));

  const subscriptionData = {
    organizationId,
    plan: planId as "FREE" | "HOUSEHOLD_BASIC" | "HOUSEHOLD_PREMIUM" | "PRO_STARTER" | "PRO_GROWTH" | "ENTERPRISE",
    status: "ACTIVE" as const,
    stripeCustomerId: stripeData?.customerId || null,
    stripeSubscriptionId: stripeData?.subscriptionId || null,
    currentPeriodStart: stripeData?.periodStart || null,
    currentPeriodEnd: stripeData?.periodEnd || null,
    seats: plan.seats,
    householdLimit: plan.householdLimit,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const [updated] = await db
      .update(subscriptions)
      .set(subscriptionData)
      .where(eq(subscriptions.organizationId, organizationId))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(subscriptions)
      .values(subscriptionData)
      .returning();
    return created;
  }
}

export async function createCheckoutSession(
  organizationId: string,
  planId: string,
  successUrl: string,
  cancelUrl: string
) {
  if (DEMO_MODE) {
    return {
      url: successUrl + "?demo=true&plan=" + planId,
      sessionId: "demo_session_" + Date.now(),
    };
  }

  let Stripe;
  try {
    Stripe = (await import("stripe")).default;
  } catch (importError) {
    console.error("[Billing] Failed to import Stripe module:", importError);
    throw new Error("Payment processing is unavailable. Please try again later.");
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const plan = getPlanById(planId);
  if (!plan || !plan.priceId) {
    throw new Error("Invalid plan or missing price ID");
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId));

  let customerId: string | undefined;

  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));

  if (existingSub?.stripeCustomerId) {
    customerId = existingSub.stripeCustomerId;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      organizationId,
      planId,
    },
  });

  return {
    url: session.url,
    sessionId: session.id,
  };
}

export async function createBillingPortalSession(
  organizationId: string,
  returnUrl: string
) {
  if (DEMO_MODE) {
    return {
      url: returnUrl + "?demo=true&portal=true",
    };
  }

  let Stripe;
  try {
    Stripe = (await import("stripe")).default;
  } catch (importError) {
    console.error("[Billing] Failed to import Stripe module:", importError);
    throw new Error("Payment processing is unavailable. Please try again later.");
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));

  if (!subscription?.stripeCustomerId) {
    throw new Error("No Stripe customer found");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return {
    url: session.url,
  };
}

export async function handleStripeWebhook(payload: Buffer, signature: string): Promise<{ received: boolean; demo?: boolean; eventType?: string; error?: string; isServerError?: boolean }> {
  if (DEMO_MODE) {
    return { received: true, demo: true };
  }

  let Stripe;
  try {
    Stripe = (await import("stripe")).default;
  } catch (importError) {
    console.error("[Billing] Failed to import Stripe module:", importError);
    return { received: false, error: "Stripe module unavailable", isServerError: true };
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (webhookError: any) {
    console.error("[Billing] Webhook signature verification failed:", webhookError?.message || webhookError);
    return { received: true, error: webhookError?.message || "Webhook signature verification failed" };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const { organizationId, planId } = session.metadata || {};
      if (organizationId && planId) {
        const subscriptionResponse = await stripe.subscriptions.retrieve(session.subscription as string);
        await createOrUpdateSubscription(organizationId, planId, {
          customerId: session.customer as string,
          subscriptionId: session.subscription as string,
          periodStart: new Date((subscriptionResponse as any).current_period_start * 1000),
          periodEnd: new Date((subscriptionResponse as any).current_period_end * 1000),
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscriptionData = event.data.object as any;
      const organizationId = subscriptionData.metadata?.organizationId;
      if (organizationId) {
        await db
          .update(subscriptions)
          .set({
            status: subscriptionData.status === "active" ? "ACTIVE" : 
                   subscriptionData.status === "past_due" ? "PAST_DUE" :
                   subscriptionData.status === "canceled" ? "CANCELED" : "ACTIVE",
            currentPeriodStart: new Date(subscriptionData.current_period_start * 1000),
            currentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.organizationId, organizationId));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const organizationId = subscription.metadata?.organizationId;
      if (organizationId) {
        await db
          .update(subscriptions)
          .set({
            status: "CANCELED",
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.organizationId, organizationId));
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const customerId = invoice.customer as string;
      
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeCustomerId, customerId));

      if (subscription) {
        await db.insert(invoices).values({
          organizationId: subscription.organizationId,
          stripeInvoiceId: invoice.id,
          amount: invoice.amount_paid,
          status: "PAID",
          invoiceUrl: invoice.hosted_invoice_url || null,
          invoicePdfUrl: invoice.invoice_pdf || null,
          paidAt: new Date(),
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = invoice.customer as string;

      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeCustomerId, customerId));

      if (subscription) {
        await db.insert(invoices).values({
          organizationId: subscription.organizationId,
          stripeInvoiceId: invoice.id,
          amount: invoice.amount_due,
          status: "FAILED",
          invoiceUrl: invoice.hosted_invoice_url || null,
          invoicePdfUrl: invoice.invoice_pdf || null,
        });

        await db
          .update(subscriptions)
          .set({ status: "PAST_DUE", updatedAt: new Date() })
          .where(eq(subscriptions.organizationId, subscription.organizationId));
      }
      break;
    }
  }

  return { received: true, eventType: event.type };
}

export async function getInvoices(organizationId: string) {
  if (DEMO_MODE) {
    return [
      {
        id: "demo-invoice-1",
        amount: 7900,
        status: "PAID",
        billingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        paidAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      {
        id: "demo-invoice-2",
        amount: 7900,
        status: "PAID",
        billingDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        paidAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    ];
  }

  return db
    .select()
    .from(invoices)
    .where(eq(invoices.organizationId, organizationId))
    .orderBy(invoices.createdAt);
}

export function canAccessFeature(
  subscription: { plan: string },
  feature: "analytics" | "ai" | "playbooks" | "api" | "whiteLabel" | "integrations"
): boolean {
  const plan = subscription.plan;
  
  switch (feature) {
    case "analytics":
      return ["PRO_STARTER", "PRO_GROWTH", "ENTERPRISE"].includes(plan);
    case "ai":
      return ["HOUSEHOLD_PREMIUM", "PRO_STARTER", "PRO_GROWTH", "ENTERPRISE"].includes(plan);
    case "playbooks":
      return ["PRO_STARTER", "PRO_GROWTH", "ENTERPRISE"].includes(plan);
    case "api":
      return ["PRO_STARTER", "PRO_GROWTH", "ENTERPRISE"].includes(plan);
    case "whiteLabel":
      return ["PRO_GROWTH", "ENTERPRISE"].includes(plan);
    case "integrations":
      return ["HOUSEHOLD_PREMIUM", "PRO_STARTER", "PRO_GROWTH", "ENTERPRISE"].includes(plan);
    default:
      return false;
  }
}
