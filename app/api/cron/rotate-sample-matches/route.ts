import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import {
  listSampleMatchCandidates,
  replaceCachedSampleMatches,
  selectSampleMatchIds,
} from "@/lib/db/queries/sample-matches";

export const runtime = "nodejs";
export const maxDuration = 60;

const LOOKBACK_DAYS = 60;

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    throw error;
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);

  try {
    const candidates = await listSampleMatchCandidates(since);
    const selectedMatchIds = selectSampleMatchIds(candidates);
    await replaceCachedSampleMatches(selectedMatchIds);

    return NextResponse.json({
      candidates: candidates.length,
      lookbackDays: LOOKBACK_DAYS,
      selectedMatchIds,
      status: "ok",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
