import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateNarrative,
  reviseNarrativeLength,
} from "@/lib/llm/stages/generate-narrative";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

const assembled = {
  match: {
    id: "f0b3b7ca-cf11-4b95-bec8-b04e1cb58889",
    kickoff_at: new Date().toISOString(),
    status: "scheduled",
    venue: "Tokyo",
    home_score: null,
    away_score: null,
    competition: null,
    home_team: null,
    away_team: null,
  },
  match_phase: null,
  recent_form: { home: [], away: [] },
  h2h_last_5: [],
  match_events: [],
  competition_standings: [],
  projected_lineups: { home: [], away: [] },
  injuries: { home: [], away: [] },
  key_stats: {
    home: {
      avg_points_for_last_5: null,
      avg_points_against_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    },
    away: {
      avg_points_for_last_5: null,
      avg_points_against_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    },
    match: {
      late_scoring: false,
      penalty_count: { away: 0, home: 0 },
      try_count: { away: 0, home: 0 },
    },
  },
  score_timeline: null,
  sourced_facts: [],
};

describe("generateNarrative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts additionalSignals as empty array", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# preview",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateNarrative({
      assembled,
      tacticalPoints: [],
      contentType: "preview",
      additionalSignals: [],
      attempt: 0,
    });

    expect(result.content).toContain("preview");
  });

  it("switches temperature 0.7 -> 0.9 -> 0.4", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "ok",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await generateNarrative({
      assembled,
      tacticalPoints: [],
      contentType: "preview",
      additionalSignals: [],
      attempt: 0,
    });
    await generateNarrative({
      assembled,
      tacticalPoints: [],
      contentType: "preview",
      additionalSignals: [],
      attempt: 1,
    });
    await generateNarrative({
      assembled,
      tacticalPoints: [],
      contentType: "preview",
      additionalSignals: [],
      attempt: 2,
    });

    expect(openAIMock.createTextResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ temperature: 0.7 }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ temperature: 0.9 }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ temperature: 0.4 }),
    );
  });

  it("adds the Japanese free first-section instruction", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# preview",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await generateNarrative({
      additionalSignals: [],
      assembled,
      attempt: 0,
      contentType: "preview",
      language: "ja",
      tacticalPoints: [],
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining(
          "第1セクション（見どころ要約）は 250〜350 字で完結",
        ),
      }),
    );
  });

  it("uses the strengthened English preview prompt and version", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# preview",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateNarrative({
      additionalSignals: [],
      assembled,
      attempt: 0,
      contentType: "preview",
      language: "en",
      tacticalPoints: [],
    });

    expect(result.promptVersion).toBe("preview@2.0.0-en");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("HARD RULES - follow without exception"),
      }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Target: 1,000+ words total."),
      }),
    );
  });

  it("uses the strengthened English recap prompt and version", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# recap",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateNarrative({
      additionalSignals: [],
      assembled,
      attempt: 0,
      contentType: "recap",
      language: "en",
      tacticalPoints: [],
    });

    expect(result.promptVersion).toBe("recap@2.2.0-en");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining(
          "Never use Japanese characters (hiragana, katakana, kanji).",
        ),
      }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Target: 1,200+ words total."),
      }),
    );
  });

  it("builds a focused Japanese length revision prompt", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# revised",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await reviseNarrativeLength({
      additionalSignals: [],
      assembled,
      contentType: "preview",
      currentContent: "# short",
      language: "ja",
      promptVersion: "preview@3.3.0",
      tacticalPoints: [],
    });

    expect(result.promptVersion).toBe(
      "preview@3.3.0+length-revision@1.0.0",
    );
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("字数下限未満です"),
        temperature: 0.6,
      }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("水増し、同義反復、抽象的な一般論"),
      }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("最終出力は1500字以上"),
      }),
    );
  });
});
