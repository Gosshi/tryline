import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateNarrative } from "@/lib/llm/stages/generate-narrative";

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
    home: { avg_points_for_last_5: null, avg_points_against_last_5: null },
    away: { avg_points_for_last_5: null, avg_points_against_last_5: null },
  },
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
});
