import { describe, expect, it } from "vitest";

import { buildJapaneseNarrativePrompt } from "@/lib/llm/stages/generate-narrative";
import { cases, tacticalPoints } from "@/tests/fixtures/content-prompt-ab";

describe("Japanese narrative prompt A baseline", () => {
  it("keeps the pre-experiment joined prompts byte-for-byte", () => {
    for (const [name, fixture] of Object.entries(cases)) {
      const options = {
        assembled: fixture.assembled,
        tacticalPoints,
        contentType: fixture.contentType,
        additionalSignals: [],
      };
      const defaultA = buildJapaneseNarrativePrompt(options);
      expect(defaultA).toMatchSnapshot(name);
      expect(buildJapaneseNarrativePrompt(options, "A")).toBe(defaultA);
    }
  });
});
