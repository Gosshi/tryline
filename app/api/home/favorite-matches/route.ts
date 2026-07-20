import { NextResponse, type NextRequest } from "next/server";

import { getFavoriteTeamMatches } from "@/lib/db/queries/matches";

const TEAM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(request: NextRequest) {
  const teamSlugs = request.nextUrl.searchParams.getAll("team");

  if (
    teamSlugs.length === 0 ||
    teamSlugs.length > 3 ||
    teamSlugs.some((slug) => !TEAM_SLUG_PATTERN.test(slug))
  ) {
    return NextResponse.json({ matches: [] }, { status: 400 });
  }

  const matches = await getFavoriteTeamMatches(teamSlugs);

  return NextResponse.json(
    { matches },
    { headers: { "Cache-Control": "no-store" } },
  );
}
