import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

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

  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata?.userId;

  if (!userId) {
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

    await supabase.from("user_profiles").upsert({
      id: userId,
      current_period_end: periodEndIso,
      premium_source: subscriptionStatus === "premium" ? "stripe" : null,
      premium_until: subscriptionStatus === "premium" ? periodEndIso : null,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      subscription_status: subscriptionStatus,
      updated_at: new Date().toISOString(),
    });
  }

  if (event.type === "customer.subscription.deleted") {
    await supabase
      .from("user_profiles")
      .update({
        premium_source: null,
        premium_until: null,
        subscription_status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  return new Response("ok");
}
