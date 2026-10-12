import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseResearchPaste } from "@/lib/discord/research-paste";
import { splitBulkResearchPaste } from "@/lib/ops/bulk-research-paste";

const fixture = readFileSync(
  "tests/fixtures/ops-bulk-research-paste.md",
  "utf8",
);
describe("splitBulkResearchPaste", () => {
  it("splits only level two headings and ignores the introductory lines", () => {
    const result = splitBulkResearchPaste(fixture);
    expect(result.linesBeforeFirstHeading).toBe(2);
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks.map((block) => block.matchId)).toEqual([
      "1e74662b-af45-4ef1-b267-156eb87329d5",
      "00000000-0000-4000-8000-000000000001",
      null,
    ]);
    expect(result.blocks[0]!.headingLine).toBe(4);
    expect(result.blocks[0]!.paste.sources[0]!.facts).toHaveLength(1);
    expect(result.blocks[0]!.paste.skippedLines).toEqual([
      { lineNumber: 5, reason: "note" },
    ]);
    expect(result.blocks[0]!.paste).toEqual(
      parseResearchPaste(
        fixture.slice(
          fixture.indexOf("\n", fixture.indexOf("## ")) + 1,
          fixture.indexOf("\n## ["),
        ),
      ),
    );
  });
  it("merges repeated IDs in source paste order", () => {
    const result = splitBulkResearchPaste(
      fixture +
        "\n## 再掲 /matches/1e74662b-af45-4ef1-b267-156eb87329d5\n### 出典: https://example.com/second\n- 追加の事実。",
    );
    expect(result.blocks).toHaveLength(3);
    expect(
      result.blocks[0]!.paste.sources.map((source) => source.sourceUrl),
    ).toEqual([
      "https://www.minutesports.fr/report",
      "https://example.com/second",
    ]);
  });
  it("rejects malformed IDs without inferring a match from names", () => {
    expect(
      splitBulkResearchPaste("## 同じチーム /matches/abc\n- 事実。").blocks[0]!
        .matchId,
    ).toBeNull();
  });
});
