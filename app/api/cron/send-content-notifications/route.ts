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

  return apiSuccess(summary, PRIVATE_CACHE_CONTROL);
}
