import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { notifyStripeWebhookIssue } from "@/lib/llm/notify";

import type { Database } from "@/lib/db/types";

export const runtime = "nodejs";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return new Stripe(apiKey);
}

function getSubscriptionStatus(status: Stripe.Subscription.Status) {
  return status === "active" || status === "trialing" ? "premium" : "free";
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const legacyPeriodEnd = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  const periodEnd =
    legacyPeriodEnd ?? subscription.items.data[0]?.current_period_end;

  if (periodEnd == null) {
    console.warn(
      `Stripe subscription ${subscription.id} has no current_period_end.`,
    );
    return null;
  }

  return periodEnd;
}

function isHandledSubscriptionEvent(eventType: string) {
  return (
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated" ||
    eventType === "customer.subscription.deleted"
  );
}

async function reportDatabaseWriteFailure({
  event,
  issueCode,
  userId,
}: {
  event: Stripe.Event;
  issueCode: "subscription_delete_failed" | "subscription_upsert_failed";
  userId: string;
}) {
  console.error("[stripe-webhook] user profile write failed", {
    eventId: event.id,
    eventType: event.type,
    issueCode,
    userId,
  });

  await notifyStripeWebhookIssue({
    eventId: event.id,
    eventType: event.type,
    issueCode,
    userId,
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (!isHandledSubscriptionEvent(event.type)) {
    return new Response("ok");
  }

  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error("[stripe-webhook] subscription event missing userId", {
      eventId: event.id,
      eventType: event.type,
      issueCode: "missing_user_id",
    });
    await notifyStripeWebhookIssue({
      eventId: event.id,
      eventType: event.type,
      issueCode: "missing_user_id",
    });
    return new Response("ok");
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const periodEnd = getCurrentPeriodEnd(subscription);
    const subscriptionStatus = getSubscriptionStatus(subscription.status);
    const periodEndIso =
      periodEnd == null ? null : new Date(periodEnd * 1_000).toISOString();

    const { error } = await supabase.from("user_profiles").upsert({
      id: userId,
      current_period_end: periodEndIso,
      premium_source: subscriptionStatus === "premium" ? "stripe" : null,
      premium_until: subscriptionStatus === "premium" ? periodEndIso : null,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      subscription_status: subscriptionStatus,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      await reportDatabaseWriteFailure({
        event,
        issueCode: "subscription_upsert_failed",
        userId,
      });
      return new Response("Database write failed", { status: 500 });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const { error } = await supabase
      .from("user_profiles")
      .update({
        premium_source: null,
        premium_until: null,
        subscription_status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      await reportDatabaseWriteFailure({
        event,
        issueCode: "subscription_delete_failed",
        userId,
      });
      return new Response("Database write failed", { status: 500 });
    }
  }

  return new Response("ok");
}
