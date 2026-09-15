import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import {
  MAX_TOP14_LNR_MATCHES_PER_RUN,
  runTop14LnrMatchEventBackfill,
} from "@/scripts/backfill-top14-lnr-match-events";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const result = await runTop14LnrMatchEventBackfill(
      { dryRun: false, limit: MAX_TOP14_LNR_MATCHES_PER_RUN },
      getSupabaseServerClient(),
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.error("[ingest-top14-match-events] failed", error);
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : String(error),
        error: "ingestion_failed",
      },
      { status: 500 },
    );
  }
}
