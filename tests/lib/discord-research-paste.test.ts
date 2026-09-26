import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseResearchPaste } from "@/lib/discord/research-paste";

const chatGptExcerpt = readFileSync(
  new URL("../fixtures/discord-research-paste-2026-09-25.txt", import.meta.url),
  "utf8",
);

describe("parseResearchPaste", () => {
  it("reads the 2026-09-25 ChatGPT excerpt and removes tracking/reference markup", () => {
    const result = parseResearchPaste(
      `${chatGptExcerpt}\n- テスト用の追加事実。`,
    );

    expect(result.sources).toHaveLength(2);
    expect(result.sources.map((source) => source.facts)).toEqual([
      [
        {
          fact: "ペルピニャンは3試合1勝2敗で10位、…で対戦する。",
          lineNumber: 4,
        },
      ],
      [
        {
          fact: "ペルピニャンは前節…1勝。",
          lineNumber: 7,
        },
        {
          fact: "テスト用の追加事実。",
          lineNumber: 10,
        },
      ],
    ]);
    expect(result.sources[0]?.sourceUrl).toBe(
      "https://www.lequipe.fr/...live/42417",
    );
    expect(result.sources[1]?.sourceUrl).toBe("https://scores24.live/...");
    expect(result.skippedLines).toEqual([{ lineNumber: 8, reason: "note" }]);
  });

  it("skips outside-source and overlong lines without dropping other facts", () => {
    const result = parseResearchPaste(
      [
        "- 出典ブロック外",
        "### 出典: https://example.com/story",
        "- 保存する事実",
        `- ${"長".repeat(301)}`,
        "- 2つ目の事実",
      ].join("\n"),
    );

    expect(result.sources[0]?.facts.map(({ fact }) => fact)).toEqual([
      "保存する事実",
      "2つ目の事実",
    ]);
    expect(result.skippedLines).toEqual([
      { lineNumber: 1, reason: "outside_source" },
      { lineNumber: 4, reason: "too_long" },
    ]);
  });

  it("reads a plain URL and ignores facts beneath a source header without a URL", () => {
    const result = parseResearchPaste(
      [
        "### 出典: URL はありません",
        "- 保存されない事実",
        "### 出典: https://example.com/story?utm_source=x&keep=y&utm_campaign=z",
        "- 保存する事実",
      ].join("\n"),
    );

    expect(result.sources).toEqual([
      {
        sourceUrl: "https://example.com/story?keep=y",
        facts: [{ fact: "保存する事実", lineNumber: 4 }],
      },
    ]);
    expect(result.skippedLines).toEqual([
      { lineNumber: 2, reason: "outside_source" },
    ]);
  });
});
