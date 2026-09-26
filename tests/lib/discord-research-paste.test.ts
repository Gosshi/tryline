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

  it("reads displayed copy without Markdown headings and skips 注記 bullets", () => {
    const result = parseResearchPaste(
      [
        "出典: https://www.lequipe.fr/Rugby/story?utm_source=chatgpt.com",
        "- ポーは試合前時点で4位、ラ・ロシェルは8位。",
        "- ポーはトマ・アティソグベを先発起用する。",
        "**出典:** https://www.section-paloise.com/actualites/story",
        "- ポーはイベントを19時30分に設定している。",
        "- 注記: 試合前コメント本文は確認できず。",
      ].join("\n"),
    );

    expect(result.sources).toEqual([
      {
        sourceUrl: "https://www.lequipe.fr/Rugby/story",
        facts: [
          { fact: "ポーは試合前時点で4位、ラ・ロシェルは8位。", lineNumber: 2 },
          { fact: "ポーはトマ・アティソグベを先発起用する。", lineNumber: 3 },
        ],
      },
      {
        sourceUrl: "https://www.section-paloise.com/actualites/story",
        facts: [
          { fact: "ポーはイベントを19時30分に設定している。", lineNumber: 5 },
        ],
      },
    ]);
    expect(result.skippedLines).toEqual([{ lineNumber: 6, reason: "note" }]);
  });

  it("ends a source at a plain-text heading or other non-bullet line", () => {
    const result = parseResearchPaste(
      [
        "出典： https://example.com/story",
        "- 出典に紐づく事実",
        "補足",
        "- 出典に紐づかない補足",
        "出典: https://another.example/story",
        "- 次の出典の事実",
      ].join("\n"),
    );

    expect(
      result.sources.map((source) => source.facts.map(({ fact }) => fact)),
    ).toEqual([["出典に紐づく事実"], ["次の出典の事実"]]);
    expect(result.skippedLines).toContainEqual({
      lineNumber: 4,
      reason: "outside_source",
    });
  });

  it("ends the current source at a second-level heading", () => {
    const result = parseResearchPaste(
      [
        "### 出典: https://example.com/story",
        "- 出典に紐づく事実",
        "## 補足",
        "- 出典に紐づかない補足",
        "### 出典: https://another.example/story",
        "- 次の出典の事実",
      ].join("\n"),
    );

    expect(
      result.sources.map((source) => source.facts.map(({ fact }) => fact)),
    ).toEqual([["出典に紐づく事実"], ["次の出典の事実"]]);
    expect(result.skippedLines).toContainEqual({
      lineNumber: 4,
      reason: "outside_source",
    });
  });
});
