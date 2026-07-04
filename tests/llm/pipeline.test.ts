import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

const notifyMock = vi.hoisted(() => ({
  notifyContentRejected: vi.fn(),
  notifyCostAlert: vi.fn(),
}));

const verifyEntitiesMock = vi.hoisted(() => ({
  verifyNarrativeEntities: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);
vi.mock("@/lib/llm/notify", () => notifyMock);
vi.mock("@/lib/llm/stages/verify-entities", () => verifyEntitiesMock);

import { generateMatchContent } from "@/lib/llm/pipeline";
import { ensureSupabaseTestEnvironment, insertMatchFixture } from "@/tests/db/helpers";

const tacticalPoints = [
  {
    away_situation: "直近5試合で平均17失点",
    home_situation: "直近5試合で平均31得点",
    match_impact: "high",
    matchup_implication: "ホームの速い球出しが相手防御を広げる",
    tactical_dimension: "アタック効率",
  },
  {
    away_situation: "直近3試合でラインアウト成功率80%",
    home_situation: "直近3試合でラインアウト成功率92%",
    match_impact: "medium",
    matchup_implication: "セットピース起点の地域獲得に差が出る",
    tactical_dimension: "ラインアウト精度",
  },
  {
    away_situation: "前節は後半70分以降に2失点",
    home_situation: "前節は終盤10分で10得点",
    match_impact: "low",
    matchup_implication: "終盤の得点機会でホームが圧力をかける",
    tactical_dimension: "終盤得点力",
  },
] as const;
const longJaPreview = `# narrative\n${"あ".repeat(1500)}`;

describe("generateMatchContent", () => {
  beforeAll(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL = "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  beforeEach(() => {
    openAIMock.createTextResponse.mockReset();
    notifyMock.notifyContentRejected.mockReset();
    notifyMock.notifyCostAlert.mockReset();
    verifyEntitiesMock.verifyNarrativeEntities.mockReset();
    verifyEntitiesMock.verifyNarrativeEntities.mockResolvedValue({
      attempts: 1,
      modelVersion: "gpt-4o-mini-2024-07-18",
      promptVersion: "entity-verification@1.0.0",
      result: { mentions: [], ungroundedSurfaces: [] },
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it("writes published content when QA passes", async () => {
    const { matchId, service } = await insertMatchFixture();

    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: tacticalPoints,
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 500 },
      })
      .mockResolvedValueOnce({
        text: longJaPreview,
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: {
            factual_grounding: 4,
            information_density: 4,
            japanese_quality: 4,
            tactical_depth: 4,
          },
          issues: [],
          verdict: "publish",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      });

    const result = await generateMatchContent(matchId, "preview");

    expect(result.status).toBe("published");
    expect(notifyMock.notifyContentRejected).not.toHaveBeenCalled();
    expect(notifyMock.notifyCostAlert).not.toHaveBeenCalled();

    const row = await service
      .from("match_content")
      .select("status")
      .eq("match_id", matchId)
      .eq("content_type", "preview")
      .single();

    expect(row.error).toBeNull();
    expect(row.data?.status).toBe("published");
  });

  it("writes draft content when QA ends with reject", async () => {
    const { matchId, service } = await insertMatchFixture();

    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: tacticalPoints,
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 500 },
      })
      .mockResolvedValueOnce({
        text: `# narrative-1\n${"あ".repeat(1500)}`,
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: {
            factual_grounding: 3,
            information_density: 2,
            japanese_quality: 3,
            tactical_depth: 3,
          },
          issues: ["retry"],
          verdict: "retry",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      })
      .mockResolvedValueOnce({
        text: `# narrative-2\n${"い".repeat(1500)}`,
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: {
            factual_grounding: 3,
            information_density: 2,
            japanese_quality: 3,
            tactical_depth: 3,
          },
          issues: ["retry"],
          verdict: "retry",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      })
      .mockResolvedValueOnce({
        text: `# narrative-3\n${"う".repeat(1500)}`,
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: {
            factual_grounding: 3,
            information_density: 2,
            japanese_quality: 3,
            tactical_depth: 3,
          },
          issues: ["reject"],
          verdict: "retry",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      });

    const result = await generateMatchContent(matchId, "preview");

    expect(result.status).toBe("draft");
    expect(notifyMock.notifyContentRejected).toHaveBeenCalledWith(matchId, "preview", result.qa);

    const row = await service
      .from("match_content")
      .select("status")
      .eq("match_id", matchId)
      .eq("content_type", "preview")
      .single();

    expect(row.error).toBeNull();
    expect(row.data?.status).toBe("draft");
  });

  it("notifies cost alert when total cost exceeds threshold", async () => {
    const { matchId } = await insertMatchFixture();

    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: tacticalPoints,
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 5_000_000, outputTokens: 1_000_000 },
      })
      .mockResolvedValueOnce({
        text: longJaPreview,
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 5_000_000, outputTokens: 5_000_000 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: {
            factual_grounding: 4,
            information_density: 4,
            japanese_quality: 4,
            tactical_depth: 4,
          },
          issues: [],
          verdict: "publish",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 5_000_000, outputTokens: 1_000_000 },
      });

    await generateMatchContent(matchId, "preview");

    expect(notifyMock.notifyCostAlert).toHaveBeenCalledTimes(1);
    expect(notifyMock.notifyCostAlert).toHaveBeenCalledWith(matchId, "preview", expect.any(Number), 0.2);
    expect((notifyMock.notifyCostAlert.mock.calls[0] ?? [])[2]).toBeGreaterThan(0.2);
  });

  it("skips recap generation without calling LLMs when match events are unavailable", async () => {
    const { matchId, service } = await insertMatchFixture();

    const update = await service
      .from("matches")
      .update({
        away_score: 17,
        home_score: 24,
        status: "finished",
      })
      .eq("id", matchId);

    expect(update.error).toBeNull();

    const result = await generateMatchContent(matchId, "recap");

    expect(result).toEqual({
      matchId,
      contentType: "recap",
      status: "skipped",
      qa: null,
    });
    expect(openAIMock.createTextResponse).not.toHaveBeenCalled();

    const row = await service
      .from("match_content")
      .select("status")
      .eq("match_id", matchId)
      .eq("content_type", "recap")
      .maybeSingle();

    expect(row.error).toBeNull();
    expect(row.data).toBeNull();
  });
});
