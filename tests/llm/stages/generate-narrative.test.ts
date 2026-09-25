import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateNarrative,
  reviseNarrativeLength,
  selectProductionPromptVariant,
  stripWrappingCodeFence,
} from "@/lib/llm/stages/generate-narrative";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

const assembled = {
  match: {
    id: "f0b3b7ca-cf11-4b95-bec8-b04e1cb58889",
    kickoff_at: new Date().toISOString(),
    kickoff_at_jst: "2026-01-01 (木) 09:00 JST",
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
      result_streak: null, games_counted: 0, wins: 0, losses: 0, draws: 0, current_streak: null,
      win_rate_last_5: null,
    },
    away: {
      avg_points_for_last_5: null,
      avg_points_against_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null, games_counted: 0, wins: 0, losses: 0, draws: 0, current_streak: null,
      win_rate_last_5: null,
    },
    match: {
      late_scoring: false,
      penalty_goal_count: { away: 0, home: 0 },
      try_count: { away: 0, home: 0 },
    },
  },
  score_timeline: null,
  derived_stats: null,
  team_stats: null,
  sourced_facts: [],
};

describe("stripWrappingCodeFence", () => {
  it("removes a wrapping markdown code fence", () => {
    expect(stripWrappingCodeFence("```markdown\n# 見出し\n本文\n```")).toBe(
      "# 見出し\n本文",
    );
  });

  it("removes a wrapping unlabeled code fence", () => {
    expect(stripWrappingCodeFence("```\n# 見出し\n```")).toBe("# 見出し");
  });

  it("leaves unfenced content unchanged", () => {
    expect(stripWrappingCodeFence("# 見出し\n本文")).toBe("# 見出し\n本文");
  });

  it("leaves internal-only code fences unchanged", () => {
    const content = "# 見出し\n```markdown\n本文\n```";

    expect(stripWrappingCodeFence(content)).toBe(content);
  });

  it("leaves unmatched opening or closing fences unchanged", () => {
    expect(stripWrappingCodeFence("```markdown\n# 見出し")).toBe(
      "```markdown\n# 見出し",
    );
    expect(stripWrappingCodeFence("# 見出し\n```")).toBe("# 見出し\n```");
  });
});

describe("selectProductionPromptVariant", () => {
  it("selects B only for Japanese recaps with scoring events", () => {
    expect(
      selectProductionPromptVariant({ contentType: "recap", language: "ja", hasEvents: true }),
    ).toBe("B");
    expect(
      selectProductionPromptVariant({ contentType: "recap", language: "ja", hasEvents: false }),
    ).toBe("A");
    expect(
      selectProductionPromptVariant({ contentType: "preview", language: "ja", hasEvents: true }),
    ).toBe("A");
    expect(
      selectProductionPromptVariant({ contentType: "recap", language: "en", hasEvents: true }),
    ).toBe("A");
  });
});

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

  it("defaults to B2 for Japanese recaps with events and returns the used variant", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# recap",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateNarrative({
      assembled: {
        ...assembled,
        match_events: [{ minute: 12, player_name: "Player One", team_name: "Home", type: "try" }],
      },
      tacticalPoints: [],
      contentType: "recap",
      additionalSignals: [],
      attempt: 0,
    });

    expect(result.promptVariant).toBe("B");
    expect(result.promptVersion).toBe("recap@5.0.0");
    expect(result.prompt).toContain("本文全体の半分以上をこの節に充てます。");
  });

  it.each([
    ["recap", "ja", "recap@4.21.2"],
    ["preview", "ja", "preview@3.15.3"],
    ["recap", "en", "recap@2.2.0-en"],
  ] as const)("keeps %s/%s on A when production B criteria are absent", async (contentType, language, version) => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# draft",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateNarrative({
      assembled: contentType === "recap" && language === "en"
        ? { ...assembled, match_events: [{ minute: 12, player_name: "Player One", team_name: "Home", type: "try" }] }
        : assembled,
      tacticalPoints: [],
      contentType,
      additionalSignals: [],
      attempt: 0,
      language,
    });

    expect(result.promptVariant).toBe("A");
    expect(result.promptVersion).toBe(version);
    expect(result.prompt).not.toContain("本文全体の半分以上をこの節に充てます。");
  });

  it("honors an explicit A variant for a Japanese recap with events", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# recap",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateNarrative({
      assembled: {
        ...assembled,
        match_events: [{ minute: 12, player_name: "Player One", team_name: "Home", type: "try" }],
      },
      tacticalPoints: [],
      contentType: "recap",
      additionalSignals: [],
      attempt: 0,
      promptVariant: "A",
    });

    expect(result.promptVariant).toBe("A");
    expect(result.promptVersion).toBe("recap@4.21.2");
  });

  it("uses GPT-5.6 Terra for each retry", async () => {
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
      expect.objectContaining({ model: "gpt-5.6-terra" }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "gpt-5.6-terra" }),
    );
    expect(openAIMock.createTextResponse).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ model: "gpt-5.6-terra" }),
    );
  });

  it("uses an explicit narrative model override", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: "# preview",
      model: "gpt-6-sol-2026-09-22",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await generateNarrative({
      assembled,
      tacticalPoints: [],
      contentType: "preview",
      additionalSignals: [],
      attempt: 0,
      model: "gpt-6-sol",
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-6-sol" }),
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

  it("injects ungrounded entity feedback on narrative retries", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# preview",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await generateNarrative({
      additionalSignals: [],
      assembled,
      attempt: 1,
      contentType: "preview",
      entityViolationSurfaces: ["アレッサンドロ・ガルビジ"],
      language: "ja",
      tacticalPoints: [],
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining(
          "入力データに存在しない人名（アレッサンドロ・ガルビジ）",
        ),
      }),
    );
  });

  it("strips wrapping code fences from generated content", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "```markdown\n# preview\n本文\n```",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateNarrative({
      additionalSignals: [],
      assembled,
      attempt: 0,
      contentType: "preview",
      tacticalPoints: [],
    });

    expect(result.content).toBe("# preview\n本文");
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
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.not.stringContaining("ラグビーユニオンの試合は80分"),
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
      promptVersion: "preview@3.6.0",
      tacticalPoints: [],
    });

    expect(result.promptVersion).toBe("preview@3.6.0+length-revision@1.0.0");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("字数下限未満です"),
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

  it("uses an explicit narrative model override for length revision", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: "# revised",
      model: "gpt-6-sol-2026-09-22",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await reviseNarrativeLength({
      additionalSignals: [],
      assembled,
      contentType: "preview",
      currentContent: "# short",
      language: "ja",
      promptVersion: "preview@1",
      tacticalPoints: [],
      model: "gpt-6-sol",
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-6-sol" }),
    );
  });

  it("injects ungrounded entity feedback on length revision", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "# revised",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await reviseNarrativeLength({
      additionalSignals: [],
      assembled,
      contentType: "preview",
      currentContent: "# short",
      entityViolationSurfaces: ["レオナルド・マリン"],
      language: "ja",
      promptVersion: "preview@3.6.0",
      tacticalPoints: [],
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining(
          "入力データに存在しない人名（レオナルド・マリン）",
        ),
      }),
    );
  });

  it("strips wrapping code fences from length revision content", async () => {
    openAIMock.createTextResponse.mockResolvedValue({
      text: "```\n# revised\n本文\n```",
      model: "gpt-4o-2024-11-20",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await reviseNarrativeLength({
      additionalSignals: [],
      assembled,
      contentType: "preview",
      currentContent: "# short",
      language: "ja",
      promptVersion: "preview@3.6.0",
      tacticalPoints: [],
    });

    expect(result.content).toBe("# revised\n本文");
  });
});
