import { describe, expect, it } from "vitest";

import { buildJapanesePlayerNameGlossary } from "@/lib/llm/stages/assemble";

describe("buildJapanesePlayerNameGlossary", () => {
  it("includes resolved Japan event players with name_ja only", () => {
    expect(
      buildJapanesePlayerNameGlossary([
        {
          player: { name: "Kippei Ishida", name_ja: "石田 吉平" },
          teamSlug: "japan",
        },
        {
          player: {
            name: "Antoine Dupont",
            name_ja: "アントワーヌ・デュポン",
          },
          teamSlug: "france",
        },
        {
          player: { name: "Unfilled Japan Player", name_ja: null },
          teamSlug: "japan",
        },
        { player: null, teamSlug: "japan" },
      ]),
    ).toEqual([
      {
        japanese: "石田 吉平",
        kind: "player",
        source: "Kippei Ishida",
      },
    ]);
  });
});
