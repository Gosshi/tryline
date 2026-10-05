import { NextResponse } from "next/server";

import {
  PUBLIC_DATA_CACHE_TAGS,
  revalidatePublicData,
} from "@/lib/cache/public-data";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { notifyStandingsIngestionIssue } from "@/lib/llm/notify";
import {
  MAX_TOP14_LNR_MATCHES_PER_RUN,
  runTop14LnrMatchEventBackfill,
} from "@/scripts/backfill-top14-lnr-match-events";
import { calculateLatestTop14Standings } from "@/scripts/calculate-standings";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const result = await runTop14LnrMatchEventBackfill(
      { dryRun: false, limit: MAX_TOP14_LNR_MATCHES_PER_RUN },
      getSupabaseServerClient(),
    );

    let standings:
      | Awaited<ReturnType<typeof calculateLatestTop14Standings>>
      | { status: "failed"; error: string };
    try {
      standings = await calculateLatestTop14Standings();
      if (standings.status === "updated") {
        revalidatePublicData(PUBLIC_DATA_CACHE_TAGS.standings);
      }
    } catch (error) {
      console.error(
        "[ingest-top14-match-events] standings calculation failed",
        error,
      );
      standings = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (standings.status === "failed") {
      await notifyStandingsIngestionIssue({
        ...standings,
        competition: "top-14",
      });
    } else if (
      standings.status === "skipped" &&
      standings.reason === "events_pending"
    ) {
      await notifyStandingsIngestionIssue({
        ...standings,
        competition: standings.competitionSlug,
      });
    }

    if (result.failedMatches.length > 0) {
      return NextResponse.json(
        { error: "ingestion_failed", ...result, standings },
        { status: 500 },
      );
    }

    return NextResponse.json({ ...result, standings });
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
