import { TRPCError } from "@trpc/server";
import Stripe from "stripe";
import { z } from "zod";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe not configured" });
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

// Stripe Price IDs — set via environment variables
// Create products in your Stripe dashboard, then add the price IDs here
function getPriceId(plan: "PRO" | "SIGNALS"): string {
  const priceIds: Record<"PRO" | "SIGNALS", string | undefined> = {
    PRO: process.env.STRIPE_PRICE_PRO,
    SIGNALS: process.env.STRIPE_PRICE_SIGNALS,
  };
  const id = priceIds[plan];
  if (!id) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Stripe price ID for ${plan} plan is not configured. Set STRIPE_PRICE_PRO and STRIPE_PRICE_SIGNALS environment variables.`,
    });
  }
  return id;
}

export const stripeRouter = router({
  /**
   * Create a Stripe Checkout Session for upgrading to PRO or SIGNALS plan.
   * Returns a URL to redirect the user to Stripe's hosted checkout page.
   */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        plan: z.enum(["PRO", "SIGNALS"]),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const db = await getDb();

      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const userId = ctx.user.id;
      const priceId = getPriceId(input.plan);

      // Look up existing Stripe customer ID for this user
      const userRecord = await db
        .select({ stripeCustomerId: users.stripeCustomerId, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const existingCustomerId = userRecord[0]?.stripeCustomerId ?? undefined;

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          user_id: String(userId),
          plan_tier: input.plan,
        },
        subscription_data: {
          metadata: {
            user_id: String(userId),
            plan_tier: input.plan,
          },
        },
        allow_promotion_codes: true,
      };

      // Reuse existing Stripe customer if available
      if (existingCustomerId) {
        sessionParams.customer = existingCustomerId;
      } else if (userRecord[0]?.email) {
        sessionParams.customer_email = userRecord[0].email;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return { url: session.url! };
    }),

  /**
   * Get the current user's subscription plan from the database.
   * Used to sync PlanContext with the real subscription state on login.
   */
  getSubscription: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      return { plan: "FREE" as const, status: null };
    }

    const db = await getDb();
    if (!db) {
      return { plan: "FREE" as const, status: null };
    }

    const result = await db
      .select({
        subscriptionPlan: users.subscriptionPlan,
        subscriptionStatus: users.subscriptionStatus,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (result.length === 0) {
      return { plan: "FREE" as const, status: null };
    }

    const { subscriptionPlan, subscriptionStatus } = result[0];
    // Only return paid plan if subscription is active or trialing
    const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    const effectivePlan = isActive ? subscriptionPlan : "FREE";

    return {
      plan: effectivePlan as "FREE" | "PRO" | "SIGNALS",
      status: subscriptionStatus,
    };
  }),

  /**
   * Create a Stripe Customer Portal session for managing existing subscriptions.
   * Allows users to cancel, update payment method, etc.
   */
  createPortalSession: protectedProcedure
    .input(z.object({ returnUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const db = await getDb();

      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const userRecord = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const customerId = userRecord[0]?.stripeCustomerId;
      if (!customerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Stripe customer found. Please subscribe first.",
        });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: input.returnUrl,
      });

      return { url: session.url };
    }),
});
