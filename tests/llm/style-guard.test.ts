import { describe, expect, it } from "vitest";

import {
  calculateNgramJaccard,
  detectAiStylePhrases,
  evaluateStyleGuardShadow,
} from "@/lib/llm/style-guard";


describe("style guard shadow mode", () => {
  it("records japanese_quality of three without changing a verdict", () => {
    const result = evaluateStyleGuardShadow({
      content: "固有の書き出しです。\n\n最後の段落です。",
      japaneseQuality: 3,
      recentArticles: [],
    });

    expect(result.japaneseQualityIsThree).toBe(true);
    expect(result.retryEquivalent).toBe(true);
  });

  it("detects deterministic AI-style phrases", () => {
    expect(
      detectAiStylePhrases(
        "試合を通じて守備の課題がことが浮き彫りになった。今後の戦いに注目したい。",
      ),
    ).toEqual(["ことが浮き彫りになった", "今後の戦いに注目したい"]);
  });

  it("flags a highly similar recent article while tolerating an empty comparison set", () => {
    const content = "冒頭の固有な分析です。\n\n## 戦術\n\n最後の結論です。";
    const result = evaluateStyleGuardShadow({
      content,
      japaneseQuality: 4,
      recentArticles: [{ content, id: "recent-article" }],
    });

    expect(calculateNgramJaccard("短文", "短文")).toBe(0);
    expect(result.similarity).toMatchObject({
      comparedArticleId: "recent-article",
      maxScore: 1,
      thresholdExceeded: true,
    });
    expect(result.retryEquivalent).toBe(true);
  });
});
