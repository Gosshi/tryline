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
  DATA_INTEGRITY_ACTION_ITEM_LIMIT,
  getQaScoreRegressions,
  notifyContentQualityRegression,
  notifyContentRejected,
  notifyBroadcastIngestReport,
  notifyCostAlert,
  notifyDataIntegrityReport,
  notifyEventIngestionIdentityAlert,
  notifyEventIntegrityMismatch,
  notifyRecapGenerationSkipped,
  notifyNewsletterDelivery,
  notifyMissingInternationals,
  notifyPrekickoffReadinessAudit,
  notifyStripeWebhookIssue,
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
    expect(payload.content).toContain("戦術的深さ(tactical_depth) 2/5");
  });

  it("includes a rejected event match id and URL in the ops notification", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyEventIngestionIdentityAlert({
      detail: "synthetic score mismatch",
      matchId: "match-rejected",
      reason: "score_mismatch",
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const payload = JSON.parse(String((request as RequestInit).body));
    expect(payload.content).toContain("試合ID: match-rejected");
    expect(payload.content).toContain(
      "https://www.trylinerugby.com/matches/match-rejected",
    );
  });

  it("posts Stripe webhook identifiers without payment or customer details", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyStripeWebhookIssue({
      eventId: "evt_test",
      eventType: "customer.subscription.updated",
      issueCode: "subscription_upsert_failed",
      userId: "00000000-0000-4000-8000-000000000001",
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const content = JSON.parse(String((request as RequestInit).body)).content;

    expect(content).toContain("Event ID: evt_test");
    expect(content).toContain("User ID: 00000000-0000-4000-8000-000000000001");
    expect(content).not.toMatch(/cus_|card|email/i);
  });

  it("posts invalid userId metadata diagnostics without a user ID", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyStripeWebhookIssue({
      eventId: "evt_test",
      eventType: "customer.subscription.updated",
      issueCode: "invalid_user_id_format",
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const content = JSON.parse(String((request as RequestInit).body)).content;

    expect(content).toContain("Event ID: evt_test");
    expect(content).toContain("Event type: customer.subscription.updated");
    expect(content).toContain("Issue: invalid_user_id_format");
    expect(content).not.toContain("User ID:");
    expect(content).not.toContain("synthetic-user@example.invalid");
  });

  it("posts deterministic diagnostics before issues for rejected content", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected("match-1", "preview", qaResult, {
      diagnostics: {
        contentLength: 1468,
        contentLengthMinimum: 1500,
        contentLengthUnit: "characters",
        deterministicGuardIssues: ["本文が目標字数の下限未満です"],
        kickoffAtJst: "2026-08-23 (日) 00:10 JST",
        lineupCount: 0,
        matchLabel: "南アフリカ 対 ニュージーランド",
        sourcedFactsCount: 7,
      },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toMatchInlineSnapshot(`
      "⚠️ コンテンツ却下 [preview]
      試合ID: match-1
      試合: 南アフリカ 対 ニュージーランド
      キックオフ: 2026-08-23 (日) 00:10 JST
      QAスコア: 情報密度 2/5 / 日本語品質 3/5 / 事実根拠 4/5 / 戦術的深さ(tactical_depth) 2/5
      本文: 1468字（下限: 1500字）
      素材: sourced_facts 7件 / ラインアップ 0件
      決定的ガード: 本文が目標字数の下限未満です
      問題点: tone_mismatch / insufficient_evidence
      対応: Supabase Studio の match_content テーブルで status を確認し、必要に応じて published に変更してください"
    `);
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
      actionableMatches: [
        {
          competitionLabel: "The Rugby Championship 2026",
          duplicateEvents: [],
          matchId: "f01f68e2-bdd6-47c8-8910-0ea37a382b0a",
          matchLabel: "オーストラリア 対 日本",
          scoreMismatch: {
            actualAway: 35,
            actualHome: 32,
            expectedAway: 17,
            expectedHome: 56,
          },
        },
      ],
      draftBacklog: { recent7Days: 2, total: 10 },
      duplicateEvents: { groupCount: 1, groups: [], matchCount: 2 },
      emptyFinishedEvents: { count: 3, matchIds: [] },
      generatedAt: "2026-07-08T00:00:00.000Z",
      scoreMismatches: { count: 4, matches: [] },
      structuralContamination: { groupCount: 0, groups: [], matchCount: 0 },
      staleScheduledMatches: {
        count: 1,
        matches: [
          {
            competitionLabel: "Greatest Rivalry 2026",
            hoursOverdue: 72,
            matchId: "stale-match",
            matchLabel: "South Africa 対 New Zealand",
          },
        ],
      },
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
    expect(body).toContain("6. 終了未反映");
    expect(body).toContain("South Africa 対 New Zealand (72時間超過)");
    expect(body).toContain("premiership-2025-26 (9日 stale)");
    expect(body).toContain("要対応: 1件");
    expect(body).toContain("f01f68e2-bdd6-47c8-8910-0ea37a382b0a");
    expect(body).toContain(
      "https://www.trylinerugby.com/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a",
    );
    expect(body).toContain(
      "オーストラリア 対 日本 — The Rugby Championship 2026",
    );
    expect(body).toContain("最終 56–17 / イベント 32–35");
  });

  it("sends a data integrity report when no published recap requires action", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyDataIntegrityReport({
      actionableMatches: [],
      draftBacklog: { recent7Days: 0, total: 0 },
      duplicateEvents: { groupCount: 0, groups: [], matchCount: 0 },
      emptyFinishedEvents: { count: 0, matchIds: [] },
      generatedAt: "2026-07-08T00:00:00.000Z",
      scoreMismatches: { count: 1, matches: [] },
      structuralContamination: { groupCount: 0, groups: [], matchCount: 0 },
      staleScheduledMatches: { count: 0, matches: [] },
      staleStandings: { competitions: [], count: 0 },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body).toContain("要対応: 0件");
    expect(body).toContain("要対応の試合はありません");
  });

  it("bounds actionable data integrity details before Discord truncation", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const actionableMatches = Array.from({ length: 50 }, (_, index) => ({
      competitionLabel: "International Rugby Competition 2026",
      duplicateEvents: [],
      matchId: `match-${index + 1}`,
      matchLabel: `ホームチーム ${index + 1} 対 アウェーチーム ${index + 1}`,
      scoreMismatch: {
        actualAway: 35,
        actualHome: 32,
        expectedAway: 17,
        expectedHome: 56,
      },
    }));

    await notifyDataIntegrityReport({
      actionableMatches,
      draftBacklog: { recent7Days: 2, total: 10 },
      duplicateEvents: { groupCount: 0, groups: [], matchCount: 0 },
      emptyFinishedEvents: { count: 0, matchIds: [] },
      generatedAt: "2026-07-08T00:00:00.000Z",
      scoreMismatches: { count: 50, matches: [] },
      structuralContamination: { groupCount: 0, groups: [], matchCount: 0 },
      staleScheduledMatches: { count: 0, matches: [] },
      staleStandings: { competitions: [], count: 0 },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body.length).toBeLessThanOrEqual(2_000);
    expect(body).toContain(`要対応の表示は先頭${DATA_INTEGRITY_ACTION_ITEM_LIMIT}件までです。残り${50 - DATA_INTEGRITY_ACTION_ITEM_LIMIT}件`);
    expect(body).toContain("match-1");
    expect(body).toContain(`match-${DATA_INTEGRITY_ACTION_ITEM_LIMIT}`);
    expect(body).not.toContain(`match-${DATA_INTEGRITY_ACTION_ITEM_LIMIT + 1}`);
    expect(body).not.toContain("…(切り詰め)");
  });

  it("posts an actionable match-level mismatch alert for generation gates", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyEventIntegrityMismatch({
      actualAway: 35,
      actualHome: 32,
      expectedAway: 17,
      expectedHome: 56,
      matchId: "match-1",
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toContain("試合ID: match-1");
    expect(body).toContain("https://www.trylinerugby.com/matches/match-1");
    expect(body).toContain("最終スコア: 56–17");
    expect(body).toContain("イベント合計: 32–35");
  });

  it("posts one bounded recap-skip report with the remaining match count", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyRecapGenerationSkipped({
      batchSize: 10,
      excludedMatches: [],
      matches: Array.from({ length: 5 }, (_, index) => ({
        competitionFamily: "top-14",
        matchId: `match-${index + 1}`,
        reason: "events_unavailable",
      })),
      skippedCount: 5,
      timeBudgetSkipped: { preview: 0, recap: 0 },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toContain("⚠️ recap 生成をスキップ（イベント不足）");
    expect(body).toContain("スキップ: 5件 / バッチ枠 10件");
    expect(body).toContain("理由別: events_unavailable 5件");
    expect(body).toContain("https://www.trylinerugby.com/matches/match-1");
    expect(body).toContain("https://www.trylinerugby.com/matches/match-4");
    expect(body).not.toContain("https://www.trylinerugby.com/matches/match-5");
    expect(body).toContain("ほか1件");
    expect(body).not.toContain("候補から除外（イベント未取得）");
    expect(body).not.toContain("時間切れで未処理");
    expect(body).toContain("対応: 得点イベントの取り込み状況を確認してください");
    expect(body.length).toBeLessThanOrEqual(2_000);
  });

  it("includes bounded eventless candidate exclusions separately from recap skips", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyRecapGenerationSkipped({
      batchSize: 10,
      excludedMatches: Array.from({ length: 5 }, (_, index) => ({
        matchId: `excluded-${index + 1}`,
      })),
      matches: [
        {
          competitionFamily: "top-14",
          matchId: "skipped-1",
          reason: "events_unavailable",
        },
      ],
      skippedCount: 1,
      timeBudgetSkipped: { preview: 0, recap: 0 },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toContain("スキップ: 1件 / バッチ枠 10件");
    expect(body).toContain("https://www.trylinerugby.com/matches/skipped-1");
    expect(body).toContain("候補から除外（イベント未取得）: 5件");
    expect(body).toContain("https://www.trylinerugby.com/matches/excluded-1");
    expect(body).toContain("https://www.trylinerugby.com/matches/excluded-4");
    expect(body).not.toContain(
      "https://www.trylinerugby.com/matches/excluded-5",
    );
    expect(body).toContain("ほか1件");
    expect(body.length).toBeLessThanOrEqual(2_000);
  });

  it("does not throw when the recap-skip webhook is not configured", async () => {
    getServerEnvMock.mockReturnValue({ DISCORD_WEBHOOK_OPS: undefined });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      notifyRecapGenerationSkipped({
        batchSize: 10,
        excludedMatches: [],
        matches: [
          {
            competitionFamily: null,
            matchId: "match-1",
            reason: "events_unavailable",
          },
        ],
        skippedCount: 1,
        timeBudgetSkipped: { preview: 0, recap: 0 },
      }),
    ).resolves.toBeUndefined();

    expect(fetch).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("includes time-budget unprocessed counts when present", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyRecapGenerationSkipped({
      batchSize: 10,
      excludedMatches: [],
      matches: [],
      skippedCount: 0,
      timeBudgetSkipped: { preview: 4, recap: 2 },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toContain("時間切れで未処理: 6件（preview 4件 / recap 2件）");
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

  it("posts missing international fixtures with Japanese team names", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyMissingInternationals(
      [
        {
          awayCode: "AUS",
          date: "2026-10-10",
          homeCode: "NZL",
          isSeniorSide: true,
          sourcePage: "2026 men's rugby union internationals",
          venue: "Eden Park, Auckland",
        },
        {
          awayCode: "NZL",
          date: "2026-10-17",
          homeCode: "AUS",
          isSeniorSide: true,
          sourcePage: "2026 men's rugby union internationals",
          venue: "Stadium Australia, Sydney",
        },
      ],
      new Map([
        ["AUS", "オーストラリア"],
        ["NZL", "ニュージーランド"],
      ]),
    );

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toContain("30日以内でDBに無い代表戦: 2試合");
    expect(body).toContain(
      "1. 2026-10-10 ニュージーランド 対 オーストラリア — Eden Park, Auckland",
    );
    expect(body).toContain(
      "2. 2026-10-17 オーストラリア 対 ニュージーランド — Stadium Australia, Sydney",
    );
    expect(body).toContain(
      "照合元: 2026 men's rugby union internationals（Wikipedia）",
    );
  });

  it("skips the missing internationals notification when there are no missing fixtures", async () => {
    await notifyMissingInternationals([], new Map());

    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts pre-kickoff readiness issues with a summary before details", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyPrekickoffReadinessAudit([
      {
        issues: ["プレビュー未公開", "draft滞留", "ラインアップ未取り込み"],
        kickoffAtJst: "2026-08-23 (日) 00:10 JST",
        matchId: "match-1",
        matchLabel: "南アフリカ 対 ニュージーランド",
      },
    ]);

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toMatchInlineSnapshot(`
      "🧭 キックオフ前準備点検
      要対応: 1試合
      1. 南アフリカ 対 ニュージーランド — 2026-08-23 (日) 00:10 JST
         プレビュー未公開 / draft滞留 / ラインアップ未取り込み
      対応: preview・sourced_facts・match_lineups を確認し、必要な手動処理を実行してください"
    `);
  });

  it("posts broadcast ingest unknown services, unlinked reasons, and missing matches", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyBroadcastIngestReport({
      changes: [
        {
          changeType: "first_destination",
          kind: "tv",
          label: "日本 対 オーストラリア",
          matchId: "match-1",
          serviceName: "BS日テレ",
        },
      ],
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
      pageErrors: [],
      requiresReconfirmation: [],
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

  it("does not post an unchanged broadcast ingest report", async () => {
    await notifyBroadcastIngestReport({
      changes: [],
      generatedAt: "2026-08-06T00:00:00.000Z",
      linked: [],
      matchesStillMissing: [],
      pageErrors: [],
      requiresReconfirmation: [],
      unknownServices: [],
      unlinkedPages: [],
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("truncates content over Discord's 2000 character limit with a visible suffix", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentRejected(
      "match-1",
      "preview",
      {
        ...qaResult,
        issues: ["x".repeat(2_500)],
      },
      {
        diagnostics: {
          contentLength: 1468,
          contentLengthMinimum: 1500,
          contentLengthUnit: "characters",
          deterministicGuardIssues: [],
          kickoffAtJst: "2026-08-23 (日) 00:10 JST",
          lineupCount: 0,
          matchLabel: "南アフリカ 対 ニュージーランド",
          sourcedFactsCount: 0,
        },
      },
    );

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const content = JSON.parse(String((request as RequestInit).body)).content;

    expect(content).toHaveLength(2_000);
    expect(content).toMatch(/…\(切り詰め\)$/);
    expect(content).toContain("本文: 1468字（下限: 1500字）");
    expect(content).toContain("素材: sourced_facts 0件 / ラインアップ 0件");
  });

  it("notifies only when a regenerated content score regresses", async () => {
    getServerEnvMock.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.com/api/webhooks/1/ops",
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await notifyContentQualityRegression({
      contentType: "preview",
      currentContentLength: 1844,
      currentScores: {
        factual_grounding: 3,
        information_density: 4,
        japanese_quality: 4,
        tactical_depth: 4,
      },
      kickoffAtJst: "2026-08-23 (日) 00:10 JST",
      matchLabel: "南アフリカ 対 ニュージーランド",
      previousContentLength: 1944,
      previousScores: {
        factual_grounding: 4,
        information_density: 5,
        japanese_quality: 4,
        tactical_depth: 3,
      },
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String((request as RequestInit).body)).content;

    expect(body).toMatchInlineSnapshot(`
      "⚠️ コンテンツ品質回帰 [preview]
      試合: 南アフリカ 対 ニュージーランド
      キックオフ: 2026-08-23 (日) 00:10 JST
      QAスコア: 情報密度 5→4 / 日本語品質 4→4 / 事実根拠 4→3 / 戦術的深さ(tactical_depth) 3→4
      本文: 1944字→1844字
      低下項目: information_density / factual_grounding
      対応: match_content の既存 published と今回の生成結果を比較してください"
    `);

    await notifyContentQualityRegression({
      contentType: "preview",
      currentContentLength: 1944,
      currentScores: {
        factual_grounding: 4,
        information_density: 5,
        japanese_quality: 5,
        tactical_depth: 4,
      },
      kickoffAtJst: "2026-08-23 (日) 00:10 JST",
      matchLabel: "南アフリカ 対 ニュージーランド",
      previousContentLength: 1944,
      previousScores: {
        factual_grounding: 4,
        information_density: 5,
        japanese_quality: 4,
        tactical_depth: 3,
      },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("identifies all and only score dimensions that decreased", () => {
    expect(
      getQaScoreRegressions(
        {
          factual_grounding: 4,
          information_density: 5,
          japanese_quality: 4,
          tactical_depth: 3,
        },
        {
          factual_grounding: 3,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 4,
        },
      ),
    ).toEqual(["information_density", "factual_grounding"]);
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
