import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { cleanupExpiredRawData } from "@/lib/retention/cleanup-raw-data";

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const result = await cleanupExpiredRawData();

    return NextResponse.json({
      status: "ok",
      deleted_rows: result.deletedRows,
      duration_ms: result.durationMs,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.error("[cleanup-raw-data] failed", error);

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
