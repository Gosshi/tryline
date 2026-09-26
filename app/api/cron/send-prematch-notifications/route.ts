import { NextResponse } from "next/server";

import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { CronUnauthorizedError, assertCronAuthorized } from "@/lib/cron/auth";
import { getMatchesInRange } from "@/lib/db/queries/matches";
import { sendPrematchPushNotifications } from "@/lib/push/notifications";

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
    }

    throw error;
  }

  const now = new Date();
  const start = new Date(now.getTime() + 30 * 60 * 1000);
  const end = new Date(now.getTime() + 90 * 60 * 1000);
  const matches = await getMatchesInRange(
    start.toISOString(),
    end.toISOString(),
  );
  const summary = await sendPrematchPushNotifications(matches);

  if (summary.failedMatches > 0) {
    return NextResponse.json(
      { data: summary, error: "notification_send_failed", success: false },
      {
        headers: { "Cache-Control": PRIVATE_CACHE_CONTROL },
        status: 500,
      },
    );
  }

  return apiSuccess(summary, PRIVATE_CACHE_CONTROL);
}
