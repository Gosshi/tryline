import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractTacticalPoints } from "@/lib/llm/stages/extract-facts";

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
    competition: null,
    home_team: null,
    away_team: null,
  },
  recent_form: { home: [], away: [] },
  h2h_last_5: [],
  projected_lineups: { home: [], away: [] },
  injuries: { home: [], away: [] },
  key_stats: {
    home: { avg_points_for_last_5: null, avg_points_against_last_5: null },
    away: { avg_points_for_last_5: null, avg_points_against_last_5: null },
  },
};

describe("extractTacticalPoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 3 tactical points from valid JSON", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        tactical_points: [
          { point: "A", detail: "a", evidence: ["x"] },
          { point: "B", detail: "b", evidence: ["y"] },
          { point: "C", detail: "c", evidence: ["z"] },
        ],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 3000, outputTokens: 500 },
    });

    const result = await extractTacticalPoints(assembled);

    expect(result.result.tactical_points).toHaveLength(3);
    expect(result.attempts).toBe(1);
  });

  it("retries once when first response is invalid JSON", async () => {
    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: "not json",
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 100, outputTokens: 100 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: [
            { point: "A", detail: "a", evidence: ["x"] },
            { point: "B", detail: "b", evidence: ["y"] },
            { point: "C", detail: "c", evidence: ["z"] },
          ],
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 100, outputTokens: 100 },
      });

    const result = await extractTacticalPoints(assembled);

    expect(result.attempts).toBe(2);
    expect(openAIMock.createTextResponse).toHaveBeenCalledTimes(2);
  });
});
