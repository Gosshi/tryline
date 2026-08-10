import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getUserFromBearer } from "@/lib/auth/bearer";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: unknown }>;
  };
};

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

function getLatestEntitlementExpiration(
  payload: RevenueCatSubscriberResponse,
) {
  const expirations = Object.values(payload.subscriber?.entitlements ?? {})
    .map((entitlement) => entitlement.expires_date)
    .filter((expiration): expiration is string => typeof expiration === "string")
    .map((expiration) => new Date(expiration))
    .filter((expiration) => !Number.isNaN(expiration.getTime()));

  if (expirations.length === 0) {
    return null;
  }

  return new Date(
    Math.max(...expirations.map((expiration) => expiration.getTime())),
  ).toISOString();
}

export async function POST(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
  }

  const { REVENUECAT_SECRET_API_KEY } = getServerEnv();

  if (!REVENUECAT_SECRET_API_KEY) {
    return apiError("revenuecat is not configured", 503, PRIVATE_CACHE_CONTROL);
  }

  const supabase = getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("premium_source, premium_until")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return apiError(profileError.message, 500, PRIVATE_CACHE_CONTROL);
  }

  if (profile && hasActiveStripeEntitlement(profile)) {
    console.info(
      `[revenuecat] Skipping entitlement sync for ${user.id}: active Stripe entitlement.`,
    );
    return apiSuccess({ synced: false }, PRIVATE_CACHE_CONTROL);
  }

  let response: Response;

  try {
    response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}`,
        },
      },
    );
  } catch {
    return apiError("RevenueCat request failed", 502, PRIVATE_CACHE_CONTROL);
  }

  if (!response.ok) {
    return apiError("RevenueCat request failed", 502, PRIVATE_CACHE_CONTROL);
  }

  let payload: RevenueCatSubscriberResponse;

  try {
    payload = (await response.json()) as RevenueCatSubscriberResponse;
  } catch {
    return apiError("RevenueCat request failed", 502, PRIVATE_CACHE_CONTROL);
  }

  const premiumUntil = getLatestEntitlementExpiration(payload);

  if (!premiumUntil) {
    return apiSuccess({ synced: false }, PRIVATE_CACHE_CONTROL);
  }

  const { error: upsertError } = await supabase.from("user_profiles").upsert({
    id: user.id,
    premium_source: "apple",
    premium_until: premiumUntil,
    updated_at: new Date().toISOString(),
  });

  if (upsertError) {
    return apiError(upsertError.message, 500, PRIVATE_CACHE_CONTROL);
  }

  return apiSuccess({ synced: true }, PRIVATE_CACHE_CONTROL);
}
