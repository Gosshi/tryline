import { describe, expect, it } from "vitest";

import { runBroadcastIngest } from "@/lib/broadcasts/ingest";

const NOW = new Date("2026-08-06T00:00:00.000Z");
const SOURCE_URL = "https://www.rugby-japan.jp/match/29968";
const PAGE = {
  broadcasts: [
    {
      serviceName: "BS日テレ",
      url: "https://www.bs4.jp/rugbycharengecup2026/",
    },
    { serviceName: "J SPORTS 1", url: "https://www.jsports.co.jp/program" },
    { serviceName: "Hulu", url: "https://www.hulu.jp/livetv/283" },
    {
      serviceName: "J SPORTSオンデマンド",
      url: "https://jod.jsports.co.jp/program",
    },
  ],
  dateLabel: "08.08 Sat",
  sourceUrl: SOURCE_URL,
};

const NOVEMBER_PAGE = {
  ...PAGE,
  dateLabel: "11.07 Sat",
};

const japanMatch = {
  awayTeam: { name: "オーストラリア", slug: "australia" },
  homeTeam: { name: "日本", slug: "japan" },
  id: "match-japan-australia",
  kickoffAt: "2026-08-08T10:05:00.000Z",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    fetchMatchPage: async () => PAGE,
    fetchSchedule: async () => ({ matchUrls: [SOURCE_URL], year: 2026 }),
    listMatchIdsWithBroadcasts: async () => new Set<string>(),
    listScheduledMatches: async () => [japanMatch],
    now: () => NOW,
    upsertBroadcasts: async () => undefined,
    ...overrides,
  };
}

describe("runBroadcastIngest", () => {
  it("links only an exact JST-date Japan match and preserves source values", async () => {
    const upserted: unknown[] = [];
    const result = await runBroadcastIngest(
      dependencies({
        upsertBroadcasts: async (broadcasts: unknown[]) =>
          upserted.push(...broadcasts),
      }),
    );

    expect(upserted).toEqual([
      {
        kind: "tv",
        matchId: "match-japan-australia",
        serviceName: "BS日テレ",
        sourceUrl: SOURCE_URL,
        url: "https://www.bs4.jp/rugbycharengecup2026/",
      },
      expect.objectContaining({ kind: "tv", serviceName: "J SPORTS 1" }),
      expect.objectContaining({ kind: "streaming", serviceName: "Hulu" }),
      expect.objectContaining({
        kind: "streaming",
        serviceName: "J SPORTSオンデマンド",
      }),
    ]);
    expect(result.linked).toHaveLength(4);
    expect(result.unlinkedPages).toEqual([]);
  });

  it("does not link when the JST date is outside the allowed window", async () => {
    const upsertBroadcasts = async () => {
      throw new Error("must not upsert");
    };
    const result = await runBroadcastIngest(
      dependencies({
        listScheduledMatches: async () => [
          { ...japanMatch, kickoffAt: "2026-08-10T10:05:00.000Z" },
        ],
        upsertBroadcasts,
      }),
    );

    expect(result.linked).toEqual([]);
    expect(result.unlinkedPages[0]?.reason).toContain("0件");
  });

  it("links a Japan match whose JST date is the day after the JRFU local date", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => NOVEMBER_PAGE,
        listScheduledMatches: async () => [
          {
            ...japanMatch,
            id: "match-wales-japan",
            kickoffAt: "2026-11-07T16:40:00.000Z",
          },
        ],
      }),
    );

    expect(result.linked).toHaveLength(4);
    expect(result.linked[0]).toMatchObject({
      matchId: "match-wales-japan",
    });
    expect(result.unlinkedPages).toEqual([]);
  });

  it("links a domestic Japan match on the JRFU local date", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => ({ ...PAGE, dateLabel: "09.05 Sat" }),
        listScheduledMatches: async () => [
          {
            ...japanMatch,
            id: "match-japan-canada",
            kickoffAt: "2026-09-05T05:50:00.000Z",
          },
        ],
      }),
    );

    expect(result.linked).toHaveLength(4);
    expect(result.unlinkedPages).toEqual([]);
  });

  it("does not link a Japan match outside the local-date and next-day window", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => NOVEMBER_PAGE,
        listScheduledMatches: async () => [
          {
            ...japanMatch,
            kickoffAt: "2026-11-09T16:40:00.000Z",
          },
        ],
        upsertBroadcasts: async () => {
          throw new Error("must not upsert");
        },
      }),
    );

    expect(result.linked).toEqual([]);
    expect(result.unlinkedPages[0]?.reason).toContain("0件");
  });

  it("does not link when one Japan match falls on each allowed JST date", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => NOVEMBER_PAGE,
        listScheduledMatches: async () => [
          {
            ...japanMatch,
            id: "match-local-date",
            kickoffAt: "2026-11-06T15:40:00.000Z",
          },
          {
            ...japanMatch,
            id: "match-next-day",
            kickoffAt: "2026-11-07T16:40:00.000Z",
          },
        ],
        upsertBroadcasts: async () => {
          throw new Error("must not upsert");
        },
      }),
    );

    expect(result.linked).toEqual([]);
    expect(result.unlinkedPages[0]?.reason).toContain("2件");
  });

  it("does not link a Japan match on the day before the JRFU local date", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => NOVEMBER_PAGE,
        listScheduledMatches: async () => [
          {
            ...japanMatch,
            kickoffAt: "2026-11-05T16:40:00.000Z",
          },
        ],
        upsertBroadcasts: async () => {
          throw new Error("must not upsert");
        },
      }),
    );

    expect(result.linked).toEqual([]);
    expect(result.unlinkedPages[0]?.reason).toContain("0件");
  });

  it("does not link when the Japan participation condition is missing", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        listScheduledMatches: async () => [
          {
            ...japanMatch,
            awayTeam: { name: "フランス", slug: "france" },
            homeTeam: { name: "オーストラリア", slug: "australia" },
          },
        ],
        upsertBroadcasts: async () => {
          throw new Error("must not upsert");
        },
      }),
    );

    expect(result.linked).toEqual([]);
    expect(result.unlinkedPages[0]?.reason).toContain("0件");
  });

  it("does not link an ambiguous date with two Japan matches", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        listScheduledMatches: async () => [
          japanMatch,
          { ...japanMatch, id: "match-japan-b" },
        ],
        upsertBroadcasts: async () => {
          throw new Error("must not upsert");
        },
      }),
    );

    expect(result.linked).toEqual([]);
    expect(result.unlinkedPages[0]?.reason).toContain("2件");
  });

  it("reports unknown services without inferring a kind or upserting them", async () => {
    const upserted: Array<{ serviceName: string }> = [];
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => ({
          ...PAGE,
          broadcasts: [
            {
              serviceName: "新しい配信サービス",
              url: "https://example.com/live",
            },
            PAGE.broadcasts[0]!,
          ],
        }),
        upsertBroadcasts: async (broadcasts: Array<{ serviceName: string }>) =>
          upserted.push(...broadcasts),
      }),
    );

    expect(upserted.map((broadcast) => broadcast.serviceName)).toEqual([
      "BS日テレ",
    ]);
    expect(result.unknownServices).toEqual([
      {
        serviceName: "新しい配信サービス",
        sourceUrl: SOURCE_URL,
        url: "https://example.com/live",
      },
    ]);
  });

  it("maps the approved WOWOW and Nippon TV services", async () => {
    const upserted: Array<{ kind: string; serviceName: string }> = [];
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => ({
          ...PAGE,
          broadcasts: [
            { serviceName: "WOWOWライブ", url: "https://example.com/live" },
            {
              serviceName: "WOWOWオンデマンド",
              url: "https://example.com/ondemand",
            },
            {
              serviceName: "日本テレビ系全国ネット",
              url: "https://example.com/nittele",
            },
            {
              serviceName: "WOWOWプライム",
              url: "https://example.com/prime",
            },
          ],
        }),
        upsertBroadcasts: async (
          broadcasts: Array<{ kind: string; serviceName: string }>,
        ) => upserted.push(...broadcasts),
      }),
    );

    expect(
      upserted.map(({ kind, serviceName }) => ({ kind, serviceName })),
    ).toEqual([
      { kind: "tv", serviceName: "WOWOWライブ" },
      { kind: "streaming", serviceName: "WOWOWオンデマンド" },
      { kind: "tv", serviceName: "日本テレビ系全国ネット" },
      { kind: "tv", serviceName: "WOWOWプライム" },
    ]);
    expect(result.unknownServices).toEqual([]);
  });

  it("normalizes half-width and full-width spaces before lookup and storage", async () => {
    const upserted: Array<{ kind: string; serviceName: string }> = [];
    const result = await runBroadcastIngest(
      dependencies({
        fetchMatchPage: async () => ({
          ...PAGE,
          broadcasts: [
            {
              serviceName: " J SPORTS オンデマンド　",
              url: "https://jod.jsports.co.jp/program",
            },
          ],
        }),
        upsertBroadcasts: async (
          broadcasts: Array<{ kind: string; serviceName: string }>,
        ) => upserted.push(...broadcasts),
      }),
    );

    expect(
      upserted.map(({ kind, serviceName }) => ({ kind, serviceName })),
    ).toEqual([{ kind: "streaming", serviceName: "J SPORTSオンデマンド" }]);
    expect(result.linked).toEqual([
      expect.objectContaining({
        serviceName: "J SPORTSオンデマンド",
      }),
    ]);
  });

  it("is idempotent when the same page is ingested twice", async () => {
    const stored = new Map<string, unknown>();
    const upsertBroadcasts = async (
      broadcasts: Array<{ matchId: string; serviceName: string }>,
    ) => {
      for (const broadcast of broadcasts) {
        stored.set(`${broadcast.matchId}:${broadcast.serviceName}`, broadcast);
      }
    };
    const input = dependencies({ upsertBroadcasts });

    await runBroadcastIngest(input);
    await runBroadcastIngest(input);

    expect(stored).toHaveLength(4);
  });

  it("does not write during a dry run", async () => {
    const result = await runBroadcastIngest(
      dependencies({
        dryRun: true,
        upsertBroadcasts: async () => {
          throw new Error("must not upsert");
        },
      }),
    );

    expect(result.linked).toHaveLength(4);
  });
});
