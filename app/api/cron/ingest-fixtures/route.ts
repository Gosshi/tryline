import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestSixNations2027Fixtures } from "@/lib/ingestion/fixtures";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const result = await ingestSixNations2027Fixtures();

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

    console.error("Failed to ingest Six Nations 2027 fixtures.", error);

    return NextResponse.json(
      { error: "Failed to ingest fixtures" },
      { status: 500 },
    );
  }
}
