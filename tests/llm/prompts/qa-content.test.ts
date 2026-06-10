import { describe, expect, it } from "vitest";

import {
  buildQaContentPrompt,
  PROMPT_VERSION,
  type QaMatchContext,
} from "@/lib/llm/prompts/qa-content";

const matchContext: QaMatchContext = {
  awayScore: 17,
  awayTeam: "France",
  homeScore: 24,
  homeTeam: "Ireland",
};

describe("buildQaContentPrompt", () => {
  it("uses qa prompt version 2.1.0", () => {
    expect(PROMPT_VERSION).toBe("qa@2.1.0");
  });

  it("uses preview length thresholds in the information density rubric", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", matchContext);

    expect(prompt).toContain("### information_density (1-5)");
    expect(prompt).toContain("- 5: 1500字以上");
    expect(prompt).toContain("- 4: 1500字以上");
    expect(prompt).toContain("- 3: 1125字以上");
    expect(prompt).toContain("- 2: 750字未満");
    expect(prompt).toContain("## 字数ゲート");
    expect(prompt).toContain("本文が1500字未満の場合");
    expect(prompt).toContain("### tactical_depth (1-5)");
    expect(prompt).toContain("一般論が皆無");
    expect(prompt).not.toContain("verdict判定");
    expect(prompt).not.toContain('"verdict"');
  });

  it("uses English word thresholds without Japanese character targets", () => {
    const prompt = buildQaContentPrompt("preview", "Body", "en", matchContext);

    expect(prompt).toContain("- 5: 550 words以上");
    expect(prompt).toContain("本文が550 words未満の場合");
    expect(prompt).not.toContain("- 5: 1500字以上");
  });

  it("uses lower English recap word thresholds", () => {
    const prompt = buildQaContentPrompt("recap", "Body", "en", matchContext);

    expect(prompt).toContain("- 5: 600 words以上");
    expect(prompt).toContain("本文が600 words未満の場合");
    expect(prompt).not.toContain("- 5: 2000字以上");
  });

  it("uses recap length thresholds in the information density rubric", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", matchContext);

    expect(prompt).toContain("- 5: 2000字以上");
    expect(prompt).toContain("- 4: 2000字以上");
    expect(prompt).toContain("- 3: 1500字以上");
    expect(prompt).toContain("- 2: 1000字未満");
  });

  it("adds winner consistency checks only for recaps", () => {
    const recapPrompt = buildQaContentPrompt("recap", "本文", "ja", matchContext);
    const previewPrompt = buildQaContentPrompt(
      "preview",
      "本文",
      "ja",
      matchContext,
    );

    expect(recapPrompt).toContain("## 勝者整合性チェック");
    expect(recapPrompt).toContain("Ireland 24 — France 17");
    expect(recapPrompt).toContain("factual_grounding を 1");
    expect(previewPrompt).not.toContain("## 勝者整合性チェック");
  });

  it("omits winner consistency checks for recaps without scores", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      awayScore: null,
      homeScore: null,
    });

    expect(prompt).not.toContain("## 勝者整合性チェック");
  });

  it("adds turning point section checks for recaps with events", () => {
    const prompt = buildQaContentPrompt(
      "recap",
      "本文",
      "ja",
      matchContext,
      true,
    );

    expect(prompt).toContain("## セクション構成チェック");
    expect(prompt).toContain("# ターニングポイント");
    expect(prompt).toContain("information_density のスコアを最大 3");
  });

  it("adds sourced facts as allowed grounding context", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [
        {
          confidence: "medium",
          fact: "Malcolm Marx is expected to miss the final.",
          source_domain: "rugbypass.com",
          source_url: "https://www.rugbypass.com/news/marx",
        },
      ],
    });

    expect(prompt).toContain("## sourced_facts grounding");
    expect(prompt).toContain("許可済み事実");
    expect(prompt).toContain("Malcolm Marx is expected to miss");
  });

  it("adds a zero-facts grounding warning when sourced facts are empty", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [],
    });

    expect(prompt).toContain("sourced_facts はゼロです");
    expect(prompt).toContain("factual_grounding を 2 以下に下げること");
  });

  it("omits turning point section checks when events are absent", () => {
    const prompt = buildQaContentPrompt(
      "recap",
      "本文",
      "ja",
      matchContext,
      false,
    );

    expect(prompt).not.toContain("## セクション構成チェック");
  });
});
