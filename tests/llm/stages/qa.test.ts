import { describe, expect, it, vi } from "vitest";

import {
  containsUnsupportedStatistic,
  UNGROUNDED_ENTITY_ISSUE,
} from "@/lib/content/fabrication-guard";
import {
  buildTeamStatsFactStrings,
  evaluateNarrativeQuality,
  resolveVerdict,
} from "@/lib/llm/stages/qa";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

const matchContext = {
  awayScore: 17,
  awayTeam: "France",
  homeScore: 24,
  homeTeam: "Ireland",
};
const longJaPreview = "あ".repeat(1500);
const longJaRecap = "あ".repeat(2000);
const passingScores = {
  factual_grounding: 4,
  information_density: 4,
  japanese_quality: 4,
  tactical_depth: 4,
};

describe("resolveVerdict", () => {
  it("retries low-density recaps even when other scores pass", () => {
    expect(
      resolveVerdict(
        { ...passingScores, information_density: 3 },
        0,
        false,
        false,
        "recap",
      ),
    ).toBe("retry");
  });

  it("publishes recaps when density is at least 4 and other scores pass", () => {
    expect(resolveVerdict(passingScores, 0, false, false, "recap")).toBe(
      "publish",
    );
  });

  it("keeps preview publish behavior at density 3", () => {
    expect(
      resolveVerdict(
        { ...passingScores, information_density: 3 },
        0,
        false,
        false,
        "preview",
      ),
    ).toBe("publish");
  });
});

describe("buildTeamStatsFactStrings", () => {
  it("allows official team stat percentages through the statistic guard", () => {
    const facts = buildTeamStatsFactStrings({
      away: { lineouts_total: 12, lineouts_won: 10, possession_pct: 42 },
      home: { lineouts_total: 11, lineouts_won: 11, possession_pct: 58 },
    });

    expect(facts).toContain("ホームチームのポゼッション率58%");
    expect(
      containsUnsupportedStatistic(
        "ホームはポゼッション58%で試合を支配した。",
        facts,
      ),
    ).toBe(false);
  });
});

describe("evaluateNarrativeQuality", () => {
  it("returns publish when all scores are >= 3", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 3,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: [],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: longJaPreview,
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("publish");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });

  it("returns retry when any score <= 2 and retry count < 2", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 2,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: ["x"],
        verdict: "retry",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: longJaPreview,
      retryCount: 1,
    });
    expect(result.result.verdict).toBe("retry");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });

  it("treats ungrounded entity violations as a factual hard block", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      entityViolations: ["アレッサンドロ・ガルビジ"],
      matchContext,
      narrative: longJaPreview,
      retryCount: 0,
    });

    expect(result.result.issues).toContain(UNGROUNDED_ENTITY_ISSUE);
    expect(result.result.scores.factual_grounding).toBe(1);
    expect(result.result.verdict).toBe("retry");
  });

  it("returns retry when tactical depth is <= 2 even if other scores pass", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 4,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 2,
        },
        issues: ["generic"],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: longJaPreview,
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("retry");
  });

  it("returns reject when retry count is already 2", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 2,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: ["x"],
        verdict: "retry",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: longJaPreview,
      retryCount: 2,
    });
    expect(result.result.verdict).toBe("reject");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });

  it("passes match context into the QA prompt", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 3,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: [],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await evaluateNarrativeQuality({
      contentType: "recap",
      matchContext,
      narrative: longJaRecap,
      retryCount: 0,
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Ireland 24 — France 17"),
      }),
    );
  });

  it("caps information density when event recap lacks the turning point heading", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: "# 試合全体像\n本文",
      retryCount: 0,
    });

    expect(result.result.scores.information_density).toBe(2);
    expect(result.result.issues).toContain(
      "ターニングポイントセクションが欠落しています",
    );
  });

  it("forces factual grounding failure when unsupported statistics are present", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: `# ターニングポイント\nIrelandはスクラム成功率85%でFranceを押し込んだ。${"あ".repeat(
        1600,
      )}`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(1);
    expect(result.result.issues).toContain("データに存在しない統計値を含む");
    expect(result.result.verdict).not.toBe("publish");
  });

  it("forces factual grounding failure when player references are ungrounded", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      hasEvents: false,
      hasLineups: false,
      matchContext,
      narrative: `# 見どころ\n${"あ".repeat(
        1500,
      )}\n# セクション2: キープレイヤーとマッチアップ\n山澤拓也（フライハーフ）、中野将伍（センター）、藤原信（スクラムハーフ）が焦点になる。`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(1);
    expect(result.result.issues).toContain(
      "ラインアップ不在にもかかわらず選手個別言及を含む",
    );
    expect(result.result.verdict).toBe("retry");
  });

  it("rejects ungrounded player references after the final retry", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      hasEvents: false,
      hasLineups: false,
      matchContext,
      narrative: `# 見どころ\n${"あ".repeat(
        1500,
      )}\n# キープレイヤー\n山澤拓也（フライハーフ）が試合を動かす。`,
      retryCount: 2,
    });

    expect(result.result.scores.factual_grounding).toBe(1);
    expect(result.result.verdict).toBe("reject");
  });

  it("allows the same player-reference pattern when lineups are present", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      hasEvents: false,
      hasLineups: true,
      matchContext,
      narrative: `# 見どころ\n${"あ".repeat(
        1500,
      )}\n# キープレイヤー\n山澤拓也（フライハーフ）が試合を動かす。`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(5);
    expect(result.result.issues).not.toContain(
      "ラインアップ不在にもかかわらず選手個別言及を含む",
    );
    expect(result.result.verdict).toBe("publish");
  });

  it("allows the same player-reference pattern when events are present", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      hasEvents: true,
      hasLineups: false,
      matchContext,
      narrative: `# 見どころ\n${"あ".repeat(
        1500,
      )}\n# キープレイヤー\n山澤拓也（フライハーフ）が試合を動かす。`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(5);
    expect(result.result.issues).not.toContain(
      "ラインアップ不在にもかかわらず選手個別言及を含む",
    );
    expect(result.result.verdict).toBe("publish");
  });

  it("blocks publishing when factual grounding is <= 2 even if length passes", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 2,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: ["事実根拠が弱い"],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: longJaPreview,
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("retry");
  });

  it("rejects factual hard blocks after the final retry instead of publishing for length", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: `Franceはスクラム成功率85%でIrelandを押し込んだ。${longJaPreview}`,
      retryCount: 2,
    });

    expect(result.result.scores.factual_grounding).toBe(1);
    expect(result.result.issues).toContain("データに存在しない統計値を含む");
    expect(result.result.verdict).toBe("reject");
  });

  it("allows sourced facts to ground otherwise unsupported statistics", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext: {
        ...matchContext,
        sourcedFacts: [
          {
            confidence: "high",
            fact: "Ireland had an 85% lineout success rate in the semifinal.",
            source_domain: "rugbypass.com",
            source_url: "https://www.rugbypass.com/news/lineout",
          },
        ],
      },
      narrative: `# 見どころ\nIrelandはラインアウト成功率85%を足場に戦う。${longJaPreview}`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(5);
    expect(result.result.issues).not.toContain(
      "データに存在しない統計値を含む",
    );
    expect(result.result.verdict).toBe("publish");
  });

  it("caps information density for a short 1107-character recap", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      matchContext,
      narrative: "あ".repeat(1107),
      retryCount: 0,
    });

    expect(result.result.scores.information_density).toBe(2);
    expect(result.result.issues).toContain("本文が目標字数の下限未満です");
  });

  it("gates short Japanese preview content even when model scores are high", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      language: "ja",
      matchContext,
      narrative: "あ".repeat(1499),
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("retry");
    expect(result.result.scores.information_density).toBe(2);
    expect(result.result.issues).toContain("本文が目標字数の下限未満です");
  });

  it("publishes a 650-word English preview without triggering the length gate", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      language: "en",
      matchContext,
      narrative: Array.from({ length: 650 }, () => "word").join(" "),
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("publish");
    expect(result.result.issues).not.toContain("本文が目標字数の下限未満です");
  });

  it("publishes a 650-word English recap without triggering the length gate", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      language: "en",
      matchContext,
      narrative: Array.from({ length: 650 }, () => "word").join(" "),
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("publish");
    expect(result.result.issues).not.toContain("本文が目標字数の下限未満です");
  });

  it("does not penalize real score, try, and ranking numbers", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: `# ターニングポイント\nIrelandが24-17でFranceに勝ち、トライ数2、順位1位という事実に基づいて整理した。${"あ".repeat(
        2000,
      )}`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(5);
    expect(result.result.scores.information_density).toBe(5);
    expect(result.result.issues).not.toContain(
      "データに存在しない統計値を含む",
    );
  });

  it("passes hasEvents into the QA prompt", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 3,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: `# ターニングポイント\n${longJaRecap}`,
      retryCount: 0,
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("## セクション構成チェック"),
      }),
    );
  });
});

describe("LLM-reported length issue stripping", () => {
  it("ignores a self-reported length issue when the measured length meets the minimum", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      model: "gpt-4o-mini",
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 4,
        },
        issues: ["本文が目標字数の下限未満です"],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const response = await evaluateNarrativeQuality({
      contentType: "recap",
      language: "ja",
      matchContext,
      narrative: longJaRecap,
      retryCount: 0,
    });

    expect(response.result.issues).not.toContain(
      "本文が目標字数の下限未満です",
    );
    expect(response.result.verdict).toBe("publish");
  });

  it("re-adds the length issue from real measurement when content is genuinely short", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      model: "gpt-4o-mini",
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 4,
        },
        issues: [],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const response = await evaluateNarrativeQuality({
      contentType: "recap",
      language: "ja",
      matchContext,
      narrative: "あ".repeat(800),
      retryCount: 0,
    });

    expect(response.result.issues).toContain("本文が目標字数の下限未満です");
    expect(response.result.verdict).toBe("retry");
  });
});
