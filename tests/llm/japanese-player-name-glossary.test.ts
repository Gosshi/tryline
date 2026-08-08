import { describe, expect, it } from "vitest";

import { buildJapanesePlayerNameGlossary } from "@/lib/llm/stages/assemble";

describe("buildJapanesePlayerNameGlossary", () => {
  it("includes resolved players with name_ja only and deduplicates by source name", () => {
    expect(
      buildJapanesePlayerNameGlossary([
        {
          player: { name: "Kippei Ishida", name_ja: "石田 吉平" },
        },
        {
          player: {
            name: "Antoine Dupont",
            name_ja: "アントワーヌ・デュポン",
          },
        },
        {
          player: { name: "Unfilled Japan Player", name_ja: null },
        },
        {
          player: { name: "Kippei Ishida", name_ja: "石田 吉平" },
        },
        { player: null },
      ]),
    ).toEqual([
      {
        japanese: "石田 吉平",
        kind: "player",
        source: "Kippei Ishida",
      },
      {
        japanese: "アントワーヌ・デュポン",
        kind: "player",
        source: "Antoine Dupont",
      },
    ]);
  });
});
