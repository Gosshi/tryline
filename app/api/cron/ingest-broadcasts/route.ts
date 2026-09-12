import { NextResponse } from "next/server";

import { runBroadcastIngest } from "@/lib/broadcasts/ingest";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { notifyBroadcastIngestReport } from "@/lib/llm/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    throw error;
  }

  try {
    const result = await runBroadcastIngest();
    await notifyBroadcastIngestReport(result);
    const hasRemainingWork =
      result.unlinkedPages.length > 0 || result.matchesStillMissing.length > 0;
    const status = result.linked.length === 0 && hasRemainingWork ? 500 : 200;

    return NextResponse.json({ result, status: "ok" }, { status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
