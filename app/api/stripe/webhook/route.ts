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
    const periodEnd = (subscription as Stripe.Subscription & {
      current_period_end?: number;
    }).current_period_end;

    await supabase
      .from("user_profiles")
      .update({
        current_period_end: periodEnd
          ? new Date(periodEnd * 1_000).toISOString()
          : null,
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
        subscription_status: getSubscriptionStatus(subscription.status),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  if (event.type === "customer.subscription.deleted") {
    await supabase
      .from("user_profiles")
      .update({
        subscription_status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  return new Response("ok");
}
