import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestAllLiveCompetitions } from "@/lib/ingestion/live-competitions";

export const maxDuration = 300;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const results = await ingestAllLiveCompetitions();

    return NextResponse.json({
      duration_ms: Date.now() - startedAt,
      results,
      status: "ok",
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Failed to ingest live competitions.", error);

    return NextResponse.json(
      { error: "Failed to ingest" },
      { status: 500 },
    );
  }
}
