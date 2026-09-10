import { fileURLToPath } from "node:url";

import base from "../../../vitest.config";

const reviewConfig = {
  ...base,
  envDir: false,
  test: {
    ...base.test,
    setupFiles: [
      "./tests/setup.ts",
      fileURLToPath(new URL("./offline-setup.ts", import.meta.url)),
    ],
    include: [
      ...(base.test?.include ?? []),
      "docs/audits/gpt6-followup-2026-09-10/*.test.ts",
      "docs/audits/gpt6-followup-2026-09-10/*.test.tsx",
      "docs/audits/gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts",
      "docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts",
    ],
  },
};

export default reviewConfig;
