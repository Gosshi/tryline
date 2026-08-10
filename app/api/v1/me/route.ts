import { createClient } from "@supabase/supabase-js";

import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getMobileUserProfile } from "@/lib/api/v1/server";
import { getUserFromBearer, getSupabaseBearerClient } from "@/lib/auth/bearer";
import { isProfilePremium } from "@/lib/auth/server";

import type { V1MeData, V1MeDeleteData } from "@/lib/api/v1/types";
import type { Database } from "@/lib/db/types";

function getSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function GET(request: Request) {
  const user = await getUserFromBearer(request);
  const client = user ? getSupabaseBearerClient(request) : null;

  if (!user || !client) {
    return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
  }

  const profile = await getMobileUserProfile(client, user.id);

  if (!profile) {
    return apiError("profile not found", 404, PRIVATE_CACHE_CONTROL);
  }

  const isPremium = isProfilePremium({ premium_until: profile.premiumUntil });
  const data: V1MeData = {
    display_name: profile.displayName,
    favorite_team_slugs: profile.favoriteTeamSlugs,
    isPremium,
    premium_until: isPremium ? profile.premiumUntil : null,
  };

  return apiSuccess(data, PRIVATE_CACHE_CONTROL);
}

export async function DELETE(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
  }

  const client = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return apiError(profileError.message, 500, PRIVATE_CACHE_CONTROL);
  }

  if (profile?.stripe_subscription_id) {
    console.warn(
      `[api/v1/me] Deleting user ${user.id} with an active Stripe subscription; the subscription was not cancelled.`,
    );
  }

  const { error } = await client.auth.admin.deleteUser(user.id);

  if (error) {
    return apiError(error.message, 500, PRIVATE_CACHE_CONTROL);
  }

  const data: V1MeDeleteData = { deleted: true };

  return apiSuccess(data, PRIVATE_CACHE_CONTROL);
}
