import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ogMocks = vi.hoisted(() => ({
  imageResponse: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  filters: [] as Array<[string, unknown]>,
  notFilters: [] as Array<[string, string, unknown]>,
  rows: [] as unknown[],
  selects: [] as string[],
}));

vi.mock("@vercel/og", () => ({
  ImageResponse: vi.fn((element: unknown, init: unknown) => {
    ogMocks.imageResponse(element, init);
    return new Response("image", {
      headers: { "content-type": "image/png" },
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

describe("/api/og competition images", () => {
  beforeEach(() => {
    dbMock.filters = [];
    dbMock.notFilters = [];
    dbMock.rows = [];
    dbMock.selects = [];
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

  it("returns a 1200x630 calendar OG image with a focus match", async () => {
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=calendar&week_label=7%E6%9C%8814%E6%97%A5%20-%2020%E6%97%A5%20JST&match_count=12&competition_count=5&focus_home=Japan&focus_away=France&focus_competition=Nations%20Championship",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
    expect(dbMock.selects).toEqual([]);
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
