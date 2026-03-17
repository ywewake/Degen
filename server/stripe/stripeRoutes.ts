import express, { type Request, type Response } from "express";
import Stripe from "stripe";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

// ── Webhook (must use raw body — registered before express.json()) ──────────
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret ?? "");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Stripe Webhook] Signature verification failed:", message);
      res.status(400).send(`Webhook Error: ${message}`);
      return;
    }

    // ⚠️ REQUIRED: return verification response for test events
    if (event.id.startsWith("evt_test_")) {
      console.log("[Stripe Webhook] Test event detected, returning verification response");
      res.json({ verified: true });
      return;
    }

    console.log(`[Stripe Webhook] Event: ${event.type} | ID: ${event.id}`);

    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "Database unavailable" });
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.user_id;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const planTier = session.metadata?.plan_tier as "PRO" | "SIGNALS" | undefined;

          if (userId && planTier) {
            await db
              .update(users)
              .set({
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                subscriptionPlan: planTier,
                subscriptionStatus: "active",
              })
              .where(eq(users.id, parseInt(userId)));
            console.log(`[Stripe] Plan activated: user ${userId} → ${planTier}`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;
          const status = sub.status;

          // Find user by stripe customer ID
          const result = await db
            .select()
            .from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);

          if (result.length > 0) {
            const user = result[0];
            const isActive = status === "active" || status === "trialing";
            await db
              .update(users)
              .set({
                subscriptionStatus: status,
                // Downgrade to FREE if subscription is no longer active
                subscriptionPlan: isActive ? user.subscriptionPlan : "FREE",
              })
              .where(eq(users.stripeCustomerId, customerId));
            console.log(`[Stripe] Subscription updated: customer ${customerId} → ${status}`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;

          await db
            .update(users)
            .set({
              subscriptionPlan: "FREE",
              subscriptionStatus: "canceled",
              stripeSubscriptionId: null,
            })
            .where(eq(users.stripeCustomerId, customerId));
          console.log(`[Stripe] Subscription canceled: customer ${customerId}`);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          await db
            .update(users)
            .set({ subscriptionStatus: "past_due" })
            .where(eq(users.stripeCustomerId, customerId));
          console.log(`[Stripe] Payment failed: customer ${customerId}`);
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      console.error("[Stripe Webhook] Handler error:", err);
      res.status(500).json({ error: "Webhook handler failed" });
      return;
    }

    res.json({ received: true });
  }
);

export default router;
