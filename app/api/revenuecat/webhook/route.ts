import { timingSafeEqual } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const HANDLED_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "CANCELLATION",
  "UNCANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "SUBSCRIPTION_PAUSED",
  "REFUND",
]);

type RevenueCatWebhookEvent = {
  app_user_id?: unknown;
  expiration_at_ms?: unknown;
  type?: unknown;
};

type RevenueCatWebhookPayload = {
  event?: RevenueCatWebhookEvent;
};

function matchesSecret(value: string | null, expected: string | undefined) {
  if (!value || !expected) {
    return false;
  }

  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function isSupabaseUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseExpiration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const expiration = new Date(value);

  return Number.isNaN(expiration.getTime()) ? null : expiration.toISOString();
}

function hasActiveStripeEntitlement(profile: {
  premium_source: string | null;
  premium_until: string | null;
}) {
  if (profile.premium_source !== "stripe" || !profile.premium_until) {
    return false;
  }

  const premiumUntil = new Date(profile.premium_until);

  return (
    !Number.isNaN(premiumUntil.getTime()) && premiumUntil.getTime() > Date.now()
  );
}

export async function POST(request: Request) {
  const { REVENUECAT_WEBHOOK_SECRET } = getServerEnv();

  if (
    !matchesSecret(
      request.headers.get("authorization"),
      REVENUECAT_WEBHOOK_SECRET,
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: RevenueCatWebhookPayload;

  try {
    payload = (await request.json()) as RevenueCatWebhookPayload;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const event = payload.event;

  if (!event || typeof event.type !== "string") {
    return new Response("ok");
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return new Response("ok");
  }

  if (typeof event.app_user_id !== "string" || !isSupabaseUserId(event.app_user_id)) {
    console.warn("[revenuecat] Skipping event for an unresolved app_user_id.");
    return new Response("ok");
  }

  const premiumUntil = parseExpiration(event.expiration_at_ms);

  if (!premiumUntil) {
    console.warn(
      `[revenuecat] Skipping ${event.type} for ${event.app_user_id}: missing expiration_at_ms.`,
    );
    return new Response("ok");
  }

  const supabase = getSupabaseServerClient();
  const { data: authUser, error: authUserError } =
    await supabase.auth.admin.getUserById(event.app_user_id);

  if (!authUser?.user) {
    if (authUserError?.status && authUserError.status !== 404) {
      throw authUserError;
    }

    console.warn("[revenuecat] Skipping event for an unresolved app_user_id.");
    return new Response("ok");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("premium_source, premium_until")
    .eq("id", authUser.user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (profile && hasActiveStripeEntitlement(profile)) {
    console.info(
      `[revenuecat] Skipping ${event.type} for ${authUser.user.id}: active Stripe entitlement.`,
    );
    return new Response("ok");
  }

  const { error: upsertError } = await supabase.from("user_profiles").upsert({
    id: authUser.user.id,
    premium_source: "apple",
    premium_until: premiumUntil,
    updated_at: new Date().toISOString(),
  });

  if (upsertError) {
    throw upsertError;
  }

  return new Response("ok");
}
