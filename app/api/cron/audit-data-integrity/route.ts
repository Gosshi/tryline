import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { runDataIntegrityAudit } from "@/lib/data-integrity/audit";
import { notifyDataIntegrityReport } from "@/lib/llm/notify";

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
    const report = await runDataIntegrityAudit();
    await notifyDataIntegrityReport(report);

    return NextResponse.json({
      report,
      status: "ok",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
