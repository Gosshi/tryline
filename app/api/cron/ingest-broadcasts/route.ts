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

    return NextResponse.json({ result, status: "ok" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
