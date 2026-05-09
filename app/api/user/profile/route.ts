import { NextResponse } from "next/server";

import { getSupabaseServerClientWithAuth, getUser } from "@/lib/auth/server";

type ProfilePatchBody = {
  favorite_team_slugs?: unknown;
};

export async function PATCH(request: Request) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as ProfilePatchBody).favorite_team_slugs)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const slugs = (body as { favorite_team_slugs: unknown[] })
    .favorite_team_slugs;

  if (slugs.some((slug) => typeof slug !== "string")) {
    return NextResponse.json({ error: "invalid slug type" }, { status: 400 });
  }

  const favoriteSlugs = slugs as string[];

  if (favoriteSlugs.length > 3) {
    return NextResponse.json({ error: "max 3 teams" }, { status: 400 });
  }

  const db = await getSupabaseServerClientWithAuth();

  if (favoriteSlugs.length > 0) {
    const { data: teams, error } = await db
      .from("teams")
      .select("slug")
      .in("slug", favoriteSlugs);

    if (error) {
      return NextResponse.json({ error: "db error" }, { status: 500 });
    }

    const validSlugs = new Set((teams ?? []).map((team) => team.slug));
    const invalid = favoriteSlugs.filter((slug) => !validSlugs.has(slug));

    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `unknown slugs: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
  }

  const { error: updateError } = await db
    .from("user_profiles")
    .update({ favorite_team_slugs: favoriteSlugs })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
