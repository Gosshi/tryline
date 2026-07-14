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

  return apiSuccess(summary, PRIVATE_CACHE_CONTROL);
}
