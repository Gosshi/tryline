import { beforeEach } from "vitest";

import { resetAnalyticsQueueForTests } from "@/lib/analytics";

beforeEach(() => {
  resetAnalyticsQueueForTests();
});
