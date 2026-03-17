import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// ── Helpers ──────────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-open-id",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionPlan: "FREE",
    subscriptionStatus: "inactive",
    ...overrides,
  };
}

function makeCtx(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ── stripe.getSubscription ────────────────────────────────────────────────────

describe("stripe.getSubscription", () => {
  it("returns FREE plan when user is not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.stripe.getSubscription();
    expect(result.plan).toBe("FREE");
    expect(result.status).toBeNull();
  });

  it("returns FREE plan when database is unavailable", async () => {
    // Mock getDb to return null (no DB connection)
    vi.doMock("../db", () => ({ getDb: async () => null }));
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.stripe.getSubscription();
    expect(result.plan).toBe("FREE");
  });
});

// ── stripe.createCheckoutSession ─────────────────────────────────────────────

describe("stripe.createCheckoutSession", () => {
  it("throws UNAUTHORIZED when user is not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.stripe.createCheckoutSession({
        plan: "PRO",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws INTERNAL_SERVER_ERROR when Stripe is not configured", async () => {
    // Ensure STRIPE_SECRET_KEY is not set
    const originalKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(
      caller.stripe.createCheckoutSession({
        plan: "PRO",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toThrow();

    // Restore
    if (originalKey) process.env.STRIPE_SECRET_KEY = originalKey;
  });
});

// ── stripe.createPortalSession ────────────────────────────────────────────────

describe("stripe.createPortalSession", () => {
  it("throws UNAUTHORIZED when user is not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.stripe.createPortalSession({
        returnUrl: "https://example.com",
      })
    ).rejects.toThrow(TRPCError);
  });
});
