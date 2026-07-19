import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const matchesMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));

const contentMock = vi.hoisted(() => ({
  getPublishedContentForMatch: vi.fn(),
}));

const sourcedFactsMock = vi.hoisted(() => ({
  getStorySourcedFactsForMatches: vi.fn(),
}));

const sampleMock = vi.hoisted(() => ({
  isSampleMatch: vi.fn(),
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/match-content", () => contentMock);
vi.mock("@/lib/db/queries/sourced-facts", () => sourcedFactsMock);
vi.mock("@/lib/sample-matches", () => sampleMock);

const LOCKED_SECRET = "LOCKED_ONLY_TACTICAL_SECRET";

const preview = {
  contentMdJa:
    "# プレビュー\n\n日本はキック処理と接点の速度が鍵になる。後半の規律も焦点。",
  contentType: "preview" as const,
  generatedAt: "2026-07-16T12:05:00.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "preview@1.0.0",
};

const recap = {
  contentMdJa:
    "# この試合の核心\n\n無料部分では日本の守備修正を扱う。\n\n# 試合全体像\n\n無料で読める全体像。\n\n# 有料の深掘り\n\n" +
    LOCKED_SECRET,
  contentType: "recap" as const,
  generatedAt: "2026-07-19T02:10:00.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "recap@1.0.0",
};

function match(overrides: Record<string, unknown> = {}) {
  return {
    awayScore: 31,
    awayTeam: {
      flagCode: "🇫🇷",
      id: "away-id",
      name: "フランス",
      shortCode: "FRA",
      slug: "france",
    },
    broadcastJpUrl: null,
    competition: {
      family: "nations-championship",
      name: "Nations Championship",
      nameJa: "ネーションズチャンピオンシップ",
      season: "2026",
      slug: "nations-championship-2026",
    },
    hasBroadcasts: false,
    hasPreview: true,
    hasRecap: true,
    homeScore: 27,
    homeTeam: {
      flagCode: "🇯🇵",
      id: "home-id",
      name: "日本",
      shortCode: "JPN",
      slug: "japan",
    },
    id: "match-1",
    kickoffAt: "2026-07-18T10:00:00.000Z",
    poolName: null,
    round: 1,
    roundName: "Round 1",
    status: "finished",
    updatedAt: "2026-07-18T12:00:00.000Z",
    venue: "国立競技場",
    ...overrides,
  };
}

describe("GET /api/v1/stories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T03:00:00.000Z"));
    matchesMock.getMatchesInRange.mockResolvedValue([match()]);
    contentMock.getPublishedContentForMatch.mockResolvedValue({
      preview,
      recap,
    });
    sourcedFactsMock.getStorySourcedFactsForMatches.mockResolvedValue([]);
    sampleMock.isSampleMatch.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current JST week stories in preview-result-recap order", async () => {
    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();

    expect(matchesMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-12T15:00:00.000Z",
      "2026-07-19T15:00:00.000Z",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(body.data.week).toEqual({
      from: "2026-07-13",
      label: "7月13日 - 19日 JST",
      to: "2026-07-19",
    });
    expect(body.data.matches[0].items.map((item: { type: string }) => item.type)).toEqual([
      "preview",
      "result",
      "recap",
    ]);
    expect(body.data.matches[0].items[0]).toMatchObject({
      contains_result: false,
      destination: {
        type: "match",
        url: "https://www.trylinerugby.com/matches/match-1",
      },
      id: "match-1:preview",
      premium_required: false,
      source_domain: null,
      title: "プレビュー｜日本 vs フランス",
    });
    expect(body.data.matches[0].items[1]).toMatchObject({
      contains_result: true,
      id: "match-1:result",
      premium_required: false,
      source_domain: null,
      summary: "日本 27-31 フランス",
      title: "試合結果｜日本 vs フランス",
    });
    expect(body.data.matches[0].items[2]).toMatchObject({
      contains_result: true,
      id: "match-1:recap",
      premium_required: true,
      source_domain: null,
      title: "レビュー｜日本 vs フランス",
    });
    expect(JSON.stringify(body)).not.toContain(LOCKED_SECRET);
    expect(body.data.matches[0].items[0].image.portrait_url).toContain(
      "https://www.trylinerugby.com/api/og?type=story&match=match-1&item=preview&v=",
    );
    expect(body.data.matches[0].items[0].image.portrait_url).toContain(
      "orientation=portrait",
    );
    expect(body.data.matches[0].items[0].image.portrait_url).not.toContain("27");
    expect(body.data.matches[0].items[0].image.portrait_url).not.toContain("31");
  });

  it("adds up to three eligible news items in fetched order with one sourced facts query", async () => {
    sourcedFactsMock.getStorySourcedFactsForMatches.mockResolvedValue([
      {
        confidence: "high",
        contentType: "preview",
        fact: "同じ出典の古いニュースです。",
        fetchedAt: "2026-07-18T09:00:00.000Z",
        id: "same-domain-old",
        matchId: "match-1",
        sourceDomain: "same.example.com",
      },
      {
        confidence: "high",
        contentType: "shared",
        fact: "同じ出典の最新ニュースです。",
        fetchedAt: "2026-07-18T09:45:00.000Z",
        id: "same-domain-latest",
        matchId: "match-1",
        sourceDomain: "same.example.com",
      },
      {
        confidence: "high",
        contentType: "preview",
        fact: "2番目に新しいニュースです。",
        fetchedAt: "2026-07-18T09:30:00.000Z",
        id: "second-latest",
        matchId: "match-1",
        sourceDomain: "second.example.com",
      },
      {
        confidence: "high",
        contentType: "shared",
        fact: "3番目に新しいニュースです。",
        fetchedAt: "2026-07-18T09:15:00.000Z",
        id: "third-latest",
        matchId: "match-1",
        sourceDomain: "third.example.com",
      },
      {
        confidence: "high",
        contentType: "preview",
        fact: "4番目のニュースなので上限で除外されます。",
        fetchedAt: "2026-07-18T09:05:00.000Z",
        id: "fourth-latest",
        matchId: "match-1",
        sourceDomain: "fourth.example.com",
      },
      {
        confidence: "high",
        contentType: "preview",
        fact: "English-only fact is excluded.",
        fetchedAt: "2026-07-18T09:50:00.000Z",
        id: "english",
        matchId: "match-1",
        sourceDomain: "english.example.com",
      },
      {
        confidence: "medium",
        contentType: "preview",
        fact: "Medium-confidence English-only fact is excluded.",
        fetchedAt: "2026-07-18T09:51:00.000Z",
        id: "medium",
        matchId: "match-1",
        sourceDomain: "medium.example.com",
      },
      {
        confidence: "low",
        contentType: "preview",
        fact: "low confidence は除外されます。",
        fetchedAt: "2026-07-18T09:52:00.000Z",
        id: "low",
        matchId: "match-1",
        sourceDomain: "low.example.com",
      },
      {
        confidence: "high",
        contentType: "preview",
        fact: "キックオフ時刻と同時のニュースは除外されます。",
        fetchedAt: "2026-07-18T10:00:00.000Z",
        id: "at-kickoff",
        matchId: "match-1",
        sourceDomain: "at-kickoff.example.com",
      },
      {
        confidence: "high",
        contentType: "recap",
        fact: "レビュー用のニュースは除外されます。",
        fetchedAt: "2026-07-18T09:55:00.000Z",
        id: "recap",
        matchId: "match-1",
        sourceDomain: "recap.example.com",
      },
    ]);

    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();
    const items = body.data.matches[0].items;

    expect(sourcedFactsMock.getStorySourcedFactsForMatches).toHaveBeenCalledTimes(1);
    expect(sourcedFactsMock.getStorySourcedFactsForMatches).toHaveBeenCalledWith([
      "match-1",
    ]);
    expect(items.map((item: { type: string }) => item.type)).toEqual([
      "preview",
      "news",
      "news",
      "news",
      "result",
      "recap",
    ]);
    expect(
      items
        .filter((item: { type: string }) => item.type === "news")
        .map((item: { id: string }) => item.id),
    ).toEqual([
      "match-1:news:third-latest",
      "match-1:news:second-latest",
      "match-1:news:same-domain-latest",
    ]);
    expect(items[1]).toMatchObject({
      contains_result: false,
      premium_required: false,
      published_at: "2026-07-18T09:15:00.000Z",
      source_domain: "third.example.com",
      summary: "3番目に新しいニュースです。",
      title: "ニュース｜日本 vs フランス",
      type: "news",
    });
    expect(JSON.stringify(items)).not.toContain("English-only");
    expect(JSON.stringify(items)).not.toContain("Medium-confidence English-only");
    expect(JSON.stringify(items)).not.toContain("low confidence");
    expect(JSON.stringify(items)).not.toContain("キックオフ時刻と同時");
    expect(JSON.stringify(items)).not.toContain("レビュー用");
    expect(JSON.stringify(items)).not.toContain("4番目のニュース");
    expect(JSON.stringify(items)).not.toContain("同じ出典の古い");
  });

  it("uses fact_ja for eligible medium-confidence English news while excluding low confidence", async () => {
    sourcedFactsMock.getStorySourcedFactsForMatches.mockResolvedValue([
      {
        confidence: "medium",
        contentType: "preview",
        fact: "England have named a changed front row for Saturday's match.",
        factJa: "イングランドは土曜日の試合に向け、フロントローを変更した布陣を発表した。",
        fetchedAt: "2026-07-18T09:30:00.000Z",
        id: "medium-translated",
        matchId: "match-1",
        sourceDomain: "englandrugby.com",
      },
      {
        confidence: "low",
        contentType: "preview",
        fact: "A low confidence item should remain excluded.",
        factJa: "低確度の情報はニュース項目に含めない。",
        fetchedAt: "2026-07-18T09:40:00.000Z",
        id: "low-translated",
        matchId: "match-1",
        sourceDomain: "low.example.com",
      },
    ]);

    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();
    const newsItems = body.data.matches[0].items.filter(
      (item: { type: string }) => item.type === "news",
    );

    expect(newsItems).toHaveLength(1);
    expect(newsItems[0]).toMatchObject({
      id: "match-1:news:medium-translated",
      summary: "イングランドは土曜日の試合に向け、フロントローを変更した布陣を発表した。",
    });
    expect(JSON.stringify(newsItems)).not.toContain("low-translated");
  });

  it("validates explicit inclusive JST date ranges", async () => {
    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(
      new Request(
        "http://localhost/api/v1/stories?from=2026-07-13&to=2026-07-19",
      ),
    );

    expect(response.status).toBe(200);
    expect(matchesMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-12T15:00:00.000Z",
      "2026-07-19T15:00:00.000Z",
    );
  });

  it("uses competition slug fallback when name_ja is null", async () => {
    matchesMock.getMatchesInRange.mockResolvedValue([
      match({
        competition: {
          family: "nations-championship",
          name: "Nations Championship",
          nameJa: null,
          season: "2026",
          slug: "nations-championship-2026",
        },
      }),
    ]);

    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();

    expect(body.data.matches[0].match.competition).toEqual({
      name: "ネーションズチャンピオンシップ",
      season: "2026",
      slug: "nations-championship-2026",
    });
  });

  it("returns the same public response regardless of Authorization header", async () => {
    const { GET } = await import("@/app/api/v1/stories/route");
    const anonymous = await GET(new Request("http://localhost/api/v1/stories"));
    const authorized = await GET(
      new Request("http://localhost/api/v1/stories", {
        headers: { Authorization: "Bearer user-token" },
      }),
    );

    expect(await authorized.text()).toBe(await anonymous.text());
  });

  it("excludes matches without story items and finished matches with a null score", async () => {
    matchesMock.getMatchesInRange.mockResolvedValue([
      match({
        awayScore: null,
        hasPreview: false,
        hasRecap: false,
        homeScore: 27,
        id: "scoreless-finished",
      }),
      match({
        hasPreview: false,
        hasRecap: false,
        id: "scheduled-empty",
        status: "scheduled",
      }),
    ]);
    contentMock.getPublishedContentForMatch.mockResolvedValue({
      preview: null,
      recap: null,
    });

    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();

    expect(body.data.matches).toEqual([]);
    expect(contentMock.getPublishedContentForMatch).not.toHaveBeenCalled();
  });

  it("excludes cancelled matches and keeps only preview for postponed matches", async () => {
    matchesMock.getMatchesInRange.mockResolvedValue([
      match({ id: "cancelled", status: "cancelled" }),
      match({ id: "postponed", status: "postponed" }),
    ]);
    contentMock.getPublishedContentForMatch.mockImplementation(async (id: string) =>
      id === "postponed"
        ? { preview, recap }
        : { preview: null, recap: null },
    );

    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();

    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].match.id).toBe("postponed");
    expect(body.data.matches[0].items.map((item: { type: string }) => item.type)).toEqual([
      "preview",
    ]);
  });

  it("does not require premium for sample match recaps", async () => {
    sampleMock.isSampleMatch.mockResolvedValue(true);

    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();

    expect(body.data.matches[0].items[2]).toMatchObject({
      premium_required: false,
      type: "recap",
    });
  });

  it("limits story matches to the first 12 kickoff-ordered matches", async () => {
    matchesMock.getMatchesInRange.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) =>
        match({
          id: `match-${String(index + 1).padStart(2, "0")}`,
          kickoffAt: `2026-07-18T${String(index).padStart(2, "0")}:00:00.000Z`,
        }),
      ),
    );
    contentMock.getPublishedContentForMatch.mockResolvedValue({
      preview,
      recap: null,
    });

    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(new Request("http://localhost/api/v1/stories"));
    const body = await response.json();

    expect(body.data.matches).toHaveLength(12);
    expect(contentMock.getPublishedContentForMatch).toHaveBeenCalledTimes(12);
    expect(contentMock.getPublishedContentForMatch).not.toHaveBeenCalledWith(
      "match-13",
    );
    expect(body.data.matches.map((story: { match: { id: string } }) => story.match.id)).toEqual(
      Array.from({ length: 12 }, (_, index) =>
        `match-${String(index + 1).padStart(2, "0")}`,
      ),
    );
  });

  it.each([
    ["from=2026-07-19&to=2026-07-13", "from must be on or before to"],
    ["from=2026-02-30&to=2026-03-01", "valid ISO 8601 dates"],
    ["from=2026-07-13", "must be provided together"],
    ["from=2026-01-01&to=2026-12-31", "must not exceed 31 days"],
  ])("returns an enveloped 400 for %s", async (query, errorFragment) => {
    const { GET } = await import("@/app/api/v1/stories/route");
    const response = await GET(
      new Request(`http://localhost/api/v1/stories?${query}`),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      data: null,
      error: expect.stringContaining(errorFragment),
      success: false,
    });
    expect(matchesMock.getMatchesInRange).not.toHaveBeenCalled();
  });
});
