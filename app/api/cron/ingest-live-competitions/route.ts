import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestAllLiveCompetitions } from "@/lib/ingestion/live-competitions";

export const maxDuration = 300;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const result = await ingestAllLiveCompetitions();

    if (result.rejections.length > 0) {
      return NextResponse.json(
        {
          duration_ms: Date.now() - startedAt,
          rejections: result.rejections,
          results: result.results,
          status: "failed",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      duration_ms: Date.now() - startedAt,
      results: result.results,
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
