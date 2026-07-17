import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ogMocks = vi.hoisted(() => ({
  imageResponse: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  filters: [] as Array<[string, unknown]>,
  notFilters: [] as Array<[string, string, unknown]>,
  rows: [] as unknown[],
  selects: [] as string[],
  singleRow: null as unknown,
}));

vi.mock("@vercel/og", () => ({
  ImageResponse: vi.fn((element: unknown, init: unknown) => {
    ogMocks.imageResponse(element, init);
    const headers = new Headers(
      (init as { headers?: HeadersInit } | undefined)?.headers,
    );
    headers.set("content-type", "image/png");

    return new Response("image", {
      headers,
      status: 200,
    });
  }),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: (table: string) => {
      expect(table).toBe("matches");

      const builder = {
        eq(column: string, value: unknown) {
          dbMock.filters.push([column, value]);
          return this;
        },
        not(column: string, operator: string, value: unknown) {
          dbMock.notFilters.push([column, operator, value]);
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: dbMock.singleRow, error: null });
        },
        order() {
          return Promise.resolve({ data: dbMock.rows, error: null });
        },
        select(value: string) {
          dbMock.selects.push(value);
          return this;
        },
      };

      return builder;
    },
  }),
}));

function getTextContent(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextContent).join("");
  }

  if (isValidElement(node)) {
    return getTextContent((node.props as { children?: unknown }).children);
  }

  return "";
}

function hasStyledText(
  node: unknown,
  expectedText: string,
  expectedStyle: Record<string, unknown>,
): boolean {
  if (isValidElement(node)) {
    const props = node.props as {
      children?: unknown;
      style?: Record<string, unknown>;
    };
    const text = getTextContent(props.children);
    const styleMatches = Object.entries(expectedStyle).every(
      ([key, value]) => props.style?.[key] === value,
    );

    if (text.includes(expectedText) && styleMatches) {
      return true;
    }

    return hasStyledText(props.children, expectedText, expectedStyle);
  }

  if (Array.isArray(node)) {
    return node.some((child) =>
      hasStyledText(child, expectedText, expectedStyle),
    );
  }

  return false;
}

describe("/api/og competition images", () => {
  beforeEach(() => {
    dbMock.filters = [];
    dbMock.notFilters = [];
    dbMock.rows = [];
    dbMock.selects = [];
    dbMock.singleRow = null;
    ogMocks.imageResponse.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]).buffer),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a 1200x630 competition OG image", async () => {
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=competition&family_name=Pacific+Nations+Cup&accent=%23c93a3a&season=2026",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
  });

  it("returns a 1200x630 calendar OG image with a focus match kickoff", async () => {
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=calendar&week_label=7%E6%9C%8814%E6%97%A5%20-%2020%E6%97%A5%20JST&match_count=12&competition_count=5&focus_home=Japan&focus_away=France&focus_competition=Nations%20Championship&focus_kickoff=2026-07-18T08%3A40%3A00.000Z",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
    const element = ogMocks.imageResponse.mock.calls.at(-1)?.[0];
    expect(getTextContent(element)).toContain(
      "注目: Japan vs France — 7/18 (土) 17:40 JST（Nations Championship）",
    );
    expect(hasStyledText(element, "5大会 12試合", { color: "#c93a40" })).toBe(
      true,
    );
    expect(dbMock.selects).toEqual([]);
  });

  it("omits invalid calendar focus kickoff values without failing", async () => {
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=calendar&week_label=7%E6%9C%8814%E6%97%A5%20-%2020%E6%97%A5%20JST&match_count=12&competition_count=5&focus_home=Japan&focus_away=France&focus_competition=Nations%20Championship&focus_kickoff=invalid-date",
      ),
    );

    expect(response.status).toBe(200);
    const element = ogMocks.imageResponse.mock.calls.at(-1)?.[0];
    expect(getTextContent(element)).toContain(
      "注目: Japan vs France（Nations Championship）",
    );
    expect(getTextContent(element)).not.toContain("invalid-date");
    expect(getTextContent(element)).not.toContain("JST（Nations");
  });

  it("returns a calendar OG image without a focus row for empty weeks", async () => {
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=calendar&week_label=7%E6%9C%8828%E6%97%A5%20-%208%E6%9C%883%E6%97%A5%20JST&match_count=0&competition_count=0",
      ),
    );

    expect(response.status).toBe(200);
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
    expect(
      getTextContent(ogMocks.imageResponse.mock.calls.at(-1)?.[0]),
    ).not.toContain("注目:");
    expect(dbMock.selects).toEqual([]);
  });

  it("keeps result OG images on the existing 1200x675 path", async () => {
    const { GET } = await import("@/app/api/og/route");

    await GET(
      new Request(
        "https://tryline.test/api/og?type=result&home=Home&away=Away&hs=20&as=10",
      ),
    );

    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 675, width: 1200 }),
    );
  });

  it("returns a 1080x1920 story result image with cache headers", async () => {
    dbMock.singleRow = storyMatch();
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=story&match=match-1&item=result&orientation=portrait&v=1784322300",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 1920, width: 1080 }),
    );
    const element = ogMocks.imageResponse.mock.calls.at(-1)?.[0];
    expect(getTextContent(element)).toContain("27 — 31");
    expect(getTextContent(element)).toContain(
      "ネーションズチャンピオンシップ 2026",
    );
    expect(dbMock.filters).toEqual([["id", "match-1"]]);
    expect(dbMock.selects[0]).toContain("home_score");
    expect(dbMock.selects[0]).toContain("slug");
  });

  it("does not render score text for story preview or recap images", async () => {
    dbMock.singleRow = storyMatch();
    const { GET } = await import("@/app/api/og/route");

    await GET(
      new Request(
        "https://tryline.test/api/og?type=story&match=match-1&item=preview&orientation=landscape",
      ),
    );
    const previewElement = ogMocks.imageResponse.mock.calls.at(-1)?.[0];

    await GET(
      new Request(
        "https://tryline.test/api/og?type=story&match=match-1&item=recap&orientation=portrait",
      ),
    );
    const recapElement = ogMocks.imageResponse.mock.calls.at(-1)?.[0];

    expect(getTextContent(previewElement)).not.toContain("27");
    expect(getTextContent(previewElement)).not.toContain("31");
    expect(getTextContent(recapElement)).not.toContain("27");
    expect(getTextContent(recapElement)).not.toContain("31");
  });

  it("shrinks long landscape story team names to avoid mid-word wrapping", async () => {
    dbMock.singleRow = storyMatch({
      away_team: {
        flag_code: null,
        name: "Very Long Away Club",
        name_ja: null,
        short_code: "AWY",
        slug: "very-long-away-club",
      },
      home_team: {
        flag_code: null,
        name: "Very Long Home Club",
        name_ja: null,
        short_code: "HOM",
        slug: "very-long-home-club",
      },
    });
    const { GET } = await import("@/app/api/og/route");

    await GET(
      new Request(
        "https://tryline.test/api/og?type=story&match=match-1&item=result&orientation=landscape",
      ),
    );

    const element = ogMocks.imageResponse.mock.calls.at(-1)?.[0];

    expect(
      hasStyledText(element, "Very Long Home Cl", { fontSize: "26px" }),
    ).toBe(true);
    expect(
      hasStyledText(element, "Very Long Away Cl", { fontSize: "26px" }),
    ).toBe(true);
  });

  it("returns a generic brand story card for a missing match", async () => {
    dbMock.singleRow = null;
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=story&match=missing&item=result&orientation=portrait",
      ),
    );

    expect(response.status).toBe(200);
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 1920, width: 1080 }),
    );
    expect(getTextContent(ogMocks.imageResponse.mock.calls.at(-1)?.[0])).toContain(
      "海外ラグビーを日本語で",
    );
  });

  it("returns a fallback round scoreboard image when no matches exist", async () => {
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=round-scoreboard&competition_id=competition-1&round=3",
      ),
    );

    expect(response.status).toBe(200);
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
    expect(dbMock.filters).toEqual([
      ["competition_id", "competition-1"],
      ["status", "finished"],
    ]);
    expect(dbMock.selects[0]).toContain("external_ids");
  });

  it("builds a round scoreboard from match scores without event data", async () => {
    dbMock.rows = [
      roundMatch("match-1", "Bath", "Saracens", 24, 18, 4),
      roundMatch("match-2", "Leicester", "Sale", 17, 21, "4"),
      roundMatch("match-3", "Exeter", "Gloucester", 30, 12, 5),
    ];

    const { GET } = await import("@/app/api/og/route");

    await GET(
      new Request(
        "https://tryline.test/api/og?type=round-scoreboard&competition_id=competition-1&round=4",
      ),
    );

    expect(dbMock.selects[0]).not.toContain("match_events");
    expect(dbMock.notFilters).toEqual([
      ["home_score", "is", null],
      ["away_score", "is", null],
    ]);
    expect(dbMock.filters).toEqual([
      ["competition_id", "competition-1"],
      ["status", "finished"],
    ]);
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
  });

  it("keeps the round scoreboard layout stable for many matches", async () => {
    dbMock.rows = Array.from({ length: 8 }, (_, index) =>
      roundMatch(
        `match-${index + 1}`,
        `Home Team ${index + 1}`,
        `Away Team ${index + 1}`,
        20 + index,
        10 + index,
        5,
      ),
    );

    const { GET } = await import("@/app/api/og/route");

    await GET(
      new Request(
        "https://tryline.test/api/og?type=round-scoreboard&competition_id=competition-1&round=5",
      ),
    );

    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
  });
});

function storyMatch(overrides: Record<string, unknown> = {}) {
  return {
    away_score: 31,
    away_team: {
      flag_code: "🇫🇷",
      name: "France",
      name_ja: "フランス",
      short_code: "FRA",
      slug: "france",
    },
    competition: {
      name: "Nations Championship",
      name_ja: null,
      season: "2026",
      slug: "nations-championship-2026",
    },
    home_score: 27,
    home_team: {
      flag_code: "🇯🇵",
      name: "Japan",
      name_ja: "日本",
      short_code: "JPN",
      slug: "japan",
    },
    id: "match-1",
    kickoff_at: "2026-07-18T10:00:00.000Z",
    status: "finished",
    ...overrides,
  };
}

function roundMatch(
  id: string,
  homeName: string,
  awayName: string,
  homeScore: number,
  awayScore: number,
  round = 4 as number | string,
) {
  return {
    away_score: awayScore,
    away_team: { name: awayName, short_code: awayName.slice(0, 3) },
    competition: {
      name: "Premiership Rugby",
      name_ja: null,
      season: "2025-26",
    },
    external_ids: { wikipedia_round: round },
    home_score: homeScore,
    home_team: { name: homeName, short_code: homeName.slice(0, 3) },
    id,
    kickoff_at: "2026-01-01T00:00:00.000Z",
  };
}
