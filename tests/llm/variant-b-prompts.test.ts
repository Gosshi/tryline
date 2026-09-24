import { describe, expect, it } from "vitest";

import { buildGeneratePreviewBPrompt } from "@/lib/llm/prompts/variant-b/generate-preview-b";
import { buildGenerateRecapBPrompt } from "@/lib/llm/prompts/variant-b/generate-recap-b";
import { buildVariantBDataBlocks } from "@/lib/llm/prompts/variant-b/shared";
import { buildJapaneseNarrativePrompt } from "@/lib/llm/stages/generate-narrative";
import { cases, tacticalPoints } from "@/tests/fixtures/content-prompt-ab";

const forbidden = [
  "2,000字",
  "250〜350",
  "最低3名",
  "最低3種類",
  "最低1つ",
  "好調（0.8",
  "ゴール4/5",
  "来シーズン",
  "【絶対禁止表現",
];

describe("variant B prompt builders", () => {
  it("omits legacy requirements in preview data branches", () => {
    const previewCases = [
      cases.preview,
      cases.recap_sparse,
      cases.recap_lineups,
    ];
    for (const fixture of previewCases) {
      const prompt = buildGeneratePreviewBPrompt(fixture.assembled, tacticalPoints, []);
      for (const phrase of forbidden) expect(prompt).not.toContain(phrase);
      expect(prompt).not.toContain("正確な最終スコアである");
    }
  });

  it("omits legacy requirements in recap data branches and requires event evidence", () => {
    for (const fixture of [cases.recap_lineups, cases.recap_events_only]) {
      const prompt = buildGenerateRecapBPrompt(fixture.assembled, tacticalPoints, []);
      for (const phrase of forbidden) expect(prompt).not.toContain(phrase);
      expect(prompt).toContain("# この試合の核心");
      expect(prompt).toContain("# 試合全体像");
      expect(prompt).toContain("# ターニングポイント");
    }
    expect(() => buildGenerateRecapBPrompt(cases.recap_sparse.assembled, tacticalPoints, [])).toThrow(/at least one match event/);
  });

  it("uses the specified sourced-facts empty block when facts are absent", () => {
    const prompt = buildGeneratePreviewBPrompt(cases.preview.assembled, tacticalPoints, []);
    expect(prompt).toContain("出典付きの事実: なし。外部記事や事前知識の負傷・欠場・統計・発言は使わない。");
  });

  it("includes unchanged timezone, duration, glossary, sanitized input and tactical data", () => {
    const prompt = buildGeneratePreviewBPrompt(cases.preview.assembled, tacticalPoints, []);
    const dataBlocks = buildVariantBDataBlocks({
      assembled: cases.preview.assembled,
      tacticalPoints,
      contentType: "preview",
      additionalSignals: [],
    });
    expect(prompt).toContain("kickoff_at_jst を必ず使うこと。");
    expect(prompt).toContain("ラグビーユニオンの試合は80分（40分ハーフ）");
    expect(prompt).toContain("【日本語表記グロッサリ】");
    expect(prompt).toContain("試合データ:");
    expect(prompt).toContain(JSON.stringify(tacticalPoints));
    expect(prompt).toContain(dataBlocks.find((block) => block.startsWith("試合データ:")) ?? "MISSING");
    expect(prompt).not.toContain("未確定選手");
  });

  it("uses the current recap display and QA headings in order", () => {
    const prompt = buildGenerateRecapBPrompt({
      ...cases.recap_events_only.assembled,
      score_timeline: {
        final_home: 24,
        final_away: 17,
        ht_home: 10,
        ht_away: 7,
        score_progression: [{ minute: 10, home: 5, away: 0, team: "home", type: "try", player: "選手A" }],
        lead_changes: [],
        winning_score: null,
      },
    }, tacticalPoints, []);
    expect(prompt.indexOf("# この試合の核心")).toBeLessThan(prompt.indexOf("# 試合全体像"));
    expect(prompt.indexOf("# 試合全体像")).toBeLessThan(prompt.indexOf("# ターニングポイント"));
    expect(prompt).toContain("得点イベント（得点者・種別・時刻の根拠）:");
    expect(prompt).toContain("スコア推移サマリー（スコアを書くときの根拠）:");
    expect(prompt).not.toContain("# ターニングポイントでは、最後にリードが入れ替わった時点");
  });

  it("does not add A's first-section instruction to B", () => {
    const prompt = buildJapaneseNarrativePrompt({
      assembled: cases.preview.assembled,
      tacticalPoints,
      contentType: "preview",
      additionalSignals: [],
    }, "B");
    expect(prompt).not.toContain("第1セクション（見どころ要約）");
  });
});
