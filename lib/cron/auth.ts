import { getServerEnv } from "@/lib/env";

export class CronUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "CronUnauthorizedError";
  }
}

export function assertCronAuthorized(request: Request): void {
  const { CRON_SECRET } = getServerEnv();
  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${CRON_SECRET}`) {
    throw new CronUnauthorizedError();
  }
}
