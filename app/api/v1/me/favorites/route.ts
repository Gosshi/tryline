import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getUserFromBearer, getSupabaseBearerClient } from "@/lib/auth/bearer";

import type { V1FavoritesData } from "@/lib/api/v1/types";

type FavoritesBody = {
  favorite_team_slugs?: unknown;
};

export async function PUT(request: Request) {
  const user = await getUserFromBearer(request);
  const client = user ? getSupabaseBearerClient(request) : null;

  if (!user || !client) {
    return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("invalid JSON body", 400, PRIVATE_CACHE_CONTROL);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as FavoritesBody).favorite_team_slugs)
  ) {
    return apiError(
      "favorite_team_slugs must be an array",
      400,
      PRIVATE_CACHE_CONTROL,
    );
  }

  const slugs = (body as { favorite_team_slugs: unknown[] })
    .favorite_team_slugs;

  if (slugs.some((slug) => typeof slug !== "string")) {
    return apiError(
      "favorite_team_slugs must contain only strings",
      400,
      PRIVATE_CACHE_CONTROL,
    );
  }

  const favoriteTeamSlugs = slugs as string[];

  if (favoriteTeamSlugs.length > 3) {
    return apiError(
      "favorite_team_slugs must contain at most 3 teams",
      400,
      PRIVATE_CACHE_CONTROL,
    );
  }

  if (favoriteTeamSlugs.length > 0) {
    const { data: teams, error } = await client
      .from("teams")
      .select("slug")
      .in("slug", favoriteTeamSlugs);

    if (error) {
      return apiError("failed to validate teams", 500, PRIVATE_CACHE_CONTROL);
    }

    const validSlugs = new Set((teams ?? []).map((team) => team.slug));
    const invalidSlugs = favoriteTeamSlugs.filter(
      (slug) => !validSlugs.has(slug),
    );

    if (invalidSlugs.length > 0) {
      return apiError(
        `unknown team slugs: ${invalidSlugs.join(", ")}`,
        400,
        PRIVATE_CACHE_CONTROL,
      );
    }
  }

  const { error } = await client
    .from("user_profiles")
    .update({ favorite_team_slugs: favoriteTeamSlugs })
    .eq("id", user.id);

  if (error) {
    return apiError("failed to update favorites", 500, PRIVATE_CACHE_CONTROL);
  }

  const data: V1FavoritesData = {
    favorite_team_slugs: favoriteTeamSlugs,
  };

  return apiSuccess(data, PRIVATE_CACHE_CONTROL);
}
