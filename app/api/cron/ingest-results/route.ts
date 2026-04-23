import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestSixNations2027Results } from "@/lib/ingestion/results";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const result = await ingestSixNations2027Results();

    return NextResponse.json({
      status: "ok",
      competition: result.competition,
      counts: result.counts,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Failed to ingest Six Nations 2027 results.", error);

    return NextResponse.json(
      { error: "Failed to ingest results" },
      { status: 500 },
    );
  }
}
