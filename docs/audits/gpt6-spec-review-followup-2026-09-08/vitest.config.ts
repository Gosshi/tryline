import { fileURLToPath } from "node:url";

import base from "../../../vitest.config";

// Review runs must not load the repository's secret .env files.
const reviewConfig = {
  ...base,
  envDir: fileURLToPath(new URL("./empty-env", import.meta.url)),
  test: {
    ...base.test,
    include: [
      ...(base.test?.include ?? []),
      "docs/audits/gpt6-spec-review-followup-2026-09-08/*.test.ts",
    ],
  },
};

export default reviewConfig;
