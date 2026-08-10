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
  notifyBroadcastIngestReport,
  notifyCostAlert,
  notifyDataIntegrityReport,
  notifyNewsletterDelivery,
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

  it("skips notification when the ops webhook URL is not configured", async () => {
    getServerEnvMock.mockReturnValue({ DISCORD_WEBHOOK_OPS: undefined });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await notifyContentRejected("match-1", "preview", qaResult);

    expect(fetch).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("DISCORD_WEBHOOK_OPS"),
    );
  });

  it("posts rejected content notification to the configured Discord ops webhook", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected("match-1", "preview", qaResult);

    expect(fetch).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/1/ops",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(request).toBeDefined();
    const payload = JSON.parse(String((request as RequestInit).body));
    expect(payload).toEqual({ content: expect.any(String) });
    expect(payload.content).toContain("⚠️ コンテンツ却下 [preview]");
    expect(payload.content).toContain("試合ID: match-1");
    expect(payload.content).toContain(
      "問題点: tone_mismatch / insufficient_evidence",
    );
  });

  it("includes preservation context and generated length for rejected refreshes", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected("match-1", "recap", qaResult, {
      contentLength: 700,
      preservedPublished: true,
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toContain("既存 published を温存");
    expect(body).toContain("生成本文: 700字");
    expect(body).toContain("問題点: tone_mismatch / insufficient_evidence");
  });

  it("does not throw when fetch fails", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      notifyCostAlert("match-1", "recap", 0.52, 0.2),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });

  it("posts data integrity report with all five audit sections", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
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
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body).toContain("1. 重複イベント");
    expect(body).toContain("2. スコア不一致");
    expect(body).toContain("3. finished イベント0件");
    expect(body).toContain("4. draft滞留");
    expect(body).toContain("5. 順位表 stale");
    expect(body).toContain("premiership-2025-26 (9日 stale)");
  });

  it("posts weekly newsletter delivery counts to Discord ops", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyNewsletterDelivery({ failed: 1, sent: 3, skipped: false });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;
    expect(body).toContain("✉️ 週次ニュースレター配信");
    expect(body).toContain("成功: 3件");
    expect(body).toContain("失敗: 1件");
  });

  it("posts broadcast ingest unknown services, unlinked reasons, and missing matches", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyBroadcastIngestReport({
      generatedAt: "2026-08-06T00:00:00.000Z",
      linked: [
        {
          kind: "tv",
          label: "日本 対 オーストラリア",
          matchId: "match-1",
          serviceName: "BS日テレ",
        },
      ],
      matchesStillMissing: [
        {
          kickoffAt: "2026-08-08T10:05:00.000Z",
          label: "フランス 対 イングランド",
          matchId: "match-2",
        },
      ],
      unknownServices: [
        {
          serviceName: "新しい配信サービス",
          sourceUrl: "https://www.rugby-japan.jp/match/1",
          url: "https://example.com/live",
        },
      ],
      unlinkedPages: [
        {
          dateLabel: "08.09 Sun",
          reason: "一致する日本代表戦が0件です",
          sourceUrl: "https://www.rugby-japan.jp/match/2",
        },
      ],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toContain("日本 対 オーストラリア: BS日テレ");
    expect(body).toContain("新しい配信サービス");
    expect(body).toContain("08.09 Sun: 一致する日本代表戦が0件です");
    expect(body).toContain("フランス 対 イングランド");
  });

  it("truncates content over Discord's 2000 character limit with a visible suffix", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected("match-1", "preview", {
      ...qaResult,
      issues: ["x".repeat(2_500)],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const content = JSON.parse(String((request as RequestInit).body)).content;

    expect(content).toHaveLength(2_000);
    expect(content).toMatch(/…\(切り詰め\)$/);
  });

  it("does not truncate content at exactly Discord's 2000 character limit", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected("match-1", "preview", {
      ...qaResult,
      issues: [""],
    });
    const initialRequest = vi.mocked(fetch).mock.calls[0]?.[1];
    const initialContent = JSON.parse(
      String((initialRequest as RequestInit).body),
    ).content;
    vi.mocked(fetch).mockClear();

    await notifyContentRejected("match-1", "preview", {
      ...qaResult,
      issues: ["x".repeat(2_000 - initialContent.length)],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const content = JSON.parse(String((request as RequestInit).body)).content;

    expect(content).toHaveLength(2_000);
    expect(content).not.toContain("…(切り詰め)");
  });

  it("logs a non-2xx Discord response without throwing", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    } as Response);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      notifyCostAlert("match-1", "recap", 0.52, 0.2),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[content-pipeline] failed to send Discord ops alert",
      expect.objectContaining({ status: 400 }),
    );
  });
});
