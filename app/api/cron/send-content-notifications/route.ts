import { NextResponse } from "next/server";

import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { CronUnauthorizedError, assertCronAuthorized } from "@/lib/cron/auth";
import { sendContentPushNotifications } from "@/lib/push/notifications";

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
    }

    throw error;
  }

  const summary = await sendContentPushNotifications();

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
