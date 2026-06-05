import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ingestLeagueOneLineups } from "@/lib/ingestion/league-one-lineups";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");

    if (matchId && !isUuid(matchId)) {
      return NextResponse.json(
        { error: "match_id must be a valid UUID" },
        { status: 400 },
      );
    }

    const result = await ingestLeagueOneLineups({
      db: getSupabaseServerClient(),
      matchId: matchId ?? undefined,
    });

    return NextResponse.json({ result, status: "ok" });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[ingest-league-one-lineups] failed", error);

    return NextResponse.json(
      { error: "Failed to ingest League One lineups" },
      { status: 500 },
    );
  }
}
