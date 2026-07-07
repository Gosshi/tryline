import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestWorldRugbyRankings } from "@/lib/ingestion/world-rankings";

export const maxDuration = 120;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const result = await ingestWorldRugbyRankings();

    return NextResponse.json({
      duration_ms: Date.now() - startedAt,
      result,
      status: "ok",
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Failed to ingest World Rugby rankings.", error);

    return NextResponse.json(
      { error: "Failed to ingest World Rugby rankings" },
      { status: 500 },
    );
  }
}
