import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerEnvMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    getServerEnv: getServerEnvMock,
  };
});

import {
  notifyContentRejected,
  notifyCostAlert,
  notifyDataIntegrityReport,
} from "@/lib/llm/notify";

import type { QaResult } from "@/lib/llm/types";

const qaResult: QaResult = {
  scores: {
    information_density: 2,
    japanese_quality: 3,
    factual_grounding: 4,
    tactical_depth: 2,
  },
  issues: ["tone_mismatch", "insufficient_evidence"],
  verdict: "reject",
};

describe("llm notify", () => {
  beforeEach(() => {
    getServerEnvMock.mockReset();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("skips notification when webhook URL is not configured", async () => {
    getServerEnvMock.mockReturnValue({ SLACK_WEBHOOK_URL: undefined });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await notifyContentRejected("match-1", "preview", qaResult);

    expect(fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("posts rejected content notification to configured webhook", async () => {
    getServerEnvMock.mockReturnValue({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/C" });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected("match-1", "preview", qaResult);

    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T/B/C",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(request).toBeDefined();
    expect(String((request as RequestInit).body)).toContain("⚠️ コンテンツ却下 [preview]");
    expect(String((request as RequestInit).body)).toContain("試合ID: match-1");
    expect(String((request as RequestInit).body)).toContain("問題点: tone_mismatch / insufficient_evidence");
  });

  it("does not throw when fetch fails", async () => {
    getServerEnvMock.mockReturnValue({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/C" });
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(notifyCostAlert("match-1", "recap", 0.52, 0.2)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });

  it("posts data integrity report with all five audit sections", async () => {
    getServerEnvMock.mockReturnValue({
      SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/C",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyDataIntegrityReport({
      draftBacklog: { recent7Days: 2, total: 10 },
      duplicateEvents: { groupCount: 1, groups: [], matchCount: 2 },
      emptyFinishedEvents: { count: 3, matchIds: [] },
      generatedAt: "2026-07-08T00:00:00.000Z",
      scoreMismatches: { count: 4, matches: [] },
      staleStandings: {
        competitions: [
          {
            competitionId: "comp-1",
            daysStale: 9,
            latestUpdatedAt: "2026-06-29T00:00:00.000Z",
            name: "Premiership",
            season: "2025-26",
            slug: "premiership-2025-26",
          },
        ],
        count: 1,
      },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = String((request as RequestInit).body);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body).toContain("1. 重複イベント");
    expect(body).toContain("2. スコア不一致");
    expect(body).toContain("3. finished イベント0件");
    expect(body).toContain("4. draft滞留");
    expect(body).toContain("5. 順位表 stale");
    expect(body).toContain("premiership-2025-26 (9日 stale)");
  });
});
