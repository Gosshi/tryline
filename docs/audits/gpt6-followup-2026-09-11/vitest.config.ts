import base from "../../../vitest.config";

const reviewConfig = {
  ...base,
  envDir: false,
  test: {
    ...base.test,
    setupFiles: [
      "./tests/setup.ts",
      "./docs/audits/gpt6-followup-2026-09-10/offline-setup.ts",
    ],
    include: [
      ...(base.test?.include ?? []),
      "docs/audits/gpt6-followup-2026-09-11/*.test.ts",
      "docs/audits/gpt6-followup-2026-09-11/*.test.tsx",
    ],
  },
};

export default reviewConfig;
