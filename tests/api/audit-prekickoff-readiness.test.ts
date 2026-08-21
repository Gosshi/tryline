import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarMatch } from "@/lib/db/queries/matches";

const authMock = vi.hoisted(() => {
  class CronUnauthorizedError extends Error {}

  return {
    CronUnauthorizedError,
    assertCronAuthorized: vi.fn(),
  };
});
const matchesMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));
const notifyMock = vi.hoisted(() => ({
  notifyPrekickoffReadinessAudit: vi.fn(),
}));
const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => authMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));
vi.mock("@/lib/llm/notify", () => notifyMock);

function createQuery(data: unknown[]) {
  const result = { data, error: null };
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    select: vi.fn(() => query),
    then: <TResult1 = typeof result, TResult2 = never>(
      onfulfilled?:
        | ((value: typeof result) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  };

  return query;
}

function createMatch(
  id: string,
  overrides: Partial<CalendarMatch> = {},
): CalendarMatch {
  return {
    awayScore: null,
    awayTeam: {
      id: `${id}-away`,
      name: "ニュージーランド",
      shortCode: "NZL",
      slug: "new-zealand",
    },
    competition: {
      family: "greatest-rivalry",
      id: "competition-1",
      name: "Greatest Rivalry",
      nameJa: "グレイテスト・ライバルリー・ツアー",
      season: "2026",
      slug: "greatest-rivalry-2026",
    },
    hasBroadcasts: false,
    hasPreview: false,
    hasRecap: false,
    homeScore: null,
    homeTeam: {
      id: `${id}-home`,
      name: "南アフリカ",
      shortCode: "RSA",
      slug: "south-africa",
    },
    id,
    kickoffAt: "2026-08-22T15:10:00.000Z",
    poolName: null,
    round: null,
    roundName: null,
    status: "scheduled",
    venue: null,
    ...overrides,
  };
}

function mockAuditRows(options: {
  content?: Array<{ match_id: string; status: string }>;
  externalIds?: Array<{ external_ids: Record<string, unknown>; id: string }>;
  facts?: Array<{ match_id: string }>;
  lineups?: Array<{ match_id: string }>;
}) {
  dbMock.from.mockImplementation((table: string) => {
    if (table === "match_content") return createQuery(options.content ?? []);
    if (table === "match_sourced_facts") return createQuery(options.facts ?? []);
    if (table === "match_lineups") return createQuery(options.lineups ?? []);
    if (table === "matches") return createQuery(options.externalIds ?? []);
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("/api/cron/audit-prekickoff-readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T13:05:00.000Z"));
    vi.clearAllMocks();
    authMock.assertCronAuthorized.mockImplementation(() => undefined);
    matchesMock.getMatchesInRange.mockResolvedValue([]);
    mockAuditRows({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when cron authorization fails", async () => {
    authMock.assertCronAuthorized.mockImplementation(() => {
      throw new authMock.CronUnauthorizedError();
    });
    const { POST } = await import(
      "@/app/api/cron/audit-prekickoff-readiness/route"
    );

    const response = await POST(
      new Request("http://localhost/api/cron/audit-prekickoff-readiness", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(matchesMock.getMatchesInRange).not.toHaveBeenCalled();
  });

  it("reports deterministic preview, lineup, and sourced-fact gaps", async () => {
    const published = createMatch("published");
    const draft = createMatch("draft");
    const wikiMissingLineup = createMatch("wiki-missing-lineup");
    const noWikipediaUrl = createMatch("no-wikipedia-url");
    matchesMock.getMatchesInRange.mockResolvedValue([
      published,
      draft,
      wikiMissingLineup,
      noWikipediaUrl,
    ]);
    mockAuditRows({
      content: [
        { match_id: "published", status: "published" },
        { match_id: "draft", status: "draft" },
      ],
      externalIds: [
        { external_ids: { wikipedia_url: "https://example.com/match" }, id: "published" },
        { external_ids: { wikipedia_url: "https://example.com/match" }, id: "draft" },
        { external_ids: { wikipedia_url: "https://example.com/match" }, id: "wiki-missing-lineup" },
        { external_ids: {}, id: "no-wikipedia-url" },
      ],
      facts: [{ match_id: "published" }, { match_id: "draft" }],
      lineups: [{ match_id: "published" }, { match_id: "draft" }],
    });
    const { POST } = await import(
      "@/app/api/cron/audit-prekickoff-readiness/route"
    );

    const response = await POST(
      new Request("http://localhost/api/cron/audit-prekickoff-readiness", {
        headers: { Authorization: "Bearer test" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(matchesMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-08-21T13:05:00.000Z",
      "2026-08-23T01:05:00.000Z",
    );
    expect(notifyMock.notifyPrekickoffReadinessAudit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          issues: ["プレビュー未公開", "draft滞留"],
          matchId: "draft",
        }),
        expect.objectContaining({
          issues: [
            "プレビュー未公開",
            "ラインアップ未取り込み",
            "sourced_facts 0件",
          ],
          kickoffAtJst: "2026-08-23 (日) 00:10 JST",
          matchId: "wiki-missing-lineup",
          matchLabel: "南アフリカ 対 ニュージーランド",
        }),
        expect.objectContaining({
          issues: ["プレビュー未公開", "sourced_facts 0件"],
          matchId: "no-wikipedia-url",
        }),
      ]),
    );
    const notified = notifyMock.notifyPrekickoffReadinessAudit.mock.calls[0]?.[0];
    expect(notified).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ matchId: "published" })]),
    );
    expect(dbMock.from).toHaveBeenCalledWith("match_content");
    expect(dbMock.from).toHaveBeenCalledWith("match_sourced_facts");
    expect(dbMock.from).toHaveBeenCalledWith("match_lineups");
    expect(dbMock.from).toHaveBeenCalledWith("matches");
  });

  it("stays silent when every target already has a published preview", async () => {
    const published = createMatch("published");
    matchesMock.getMatchesInRange.mockResolvedValue([published]);
    mockAuditRows({
      content: [{ match_id: "published", status: "published" }],
      externalIds: [
        { external_ids: { wikipedia_url: "https://example.com/match" }, id: "published" },
      ],
      facts: [{ match_id: "published" }],
      lineups: [{ match_id: "published" }],
    });
    const { POST } = await import(
      "@/app/api/cron/audit-prekickoff-readiness/route"
    );

    const response = await POST(
      new Request("http://localhost/api/cron/audit-prekickoff-readiness", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { audited: 1, issues: 0 },
      error: null,
      success: true,
    });
    expect(notifyMock.notifyPrekickoffReadinessAudit).not.toHaveBeenCalled();
  });
});
