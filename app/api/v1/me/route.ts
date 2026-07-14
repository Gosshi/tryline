import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getMobileUserProfile } from "@/lib/api/v1/server";
import { getUserFromBearer, getSupabaseBearerClient } from "@/lib/auth/bearer";
import { isProfilePremium } from "@/lib/auth/server";

import type { V1MeData } from "@/lib/api/v1/types";

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

  const data: V1MeData = {
    display_name: profile.displayName,
    favorite_team_slugs: profile.favoriteTeamSlugs,
    isPremium: isProfilePremium({ premium_until: profile.premiumUntil }),
  };

  return apiSuccess(data, PRIVATE_CACHE_CONTROL);
}
