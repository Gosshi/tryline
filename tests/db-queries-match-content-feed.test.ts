import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => dbMock,
}));

import { listPublishedRecapsForFeed } from "@/lib/db/queries/match-content";

type Competition = {
  family?: string | null;
  name: string;
  name_ja?: string | null;
  season: string;
  slug?: string | null;
};

function createQuery(data: unknown[]) {
  const query = {
    eq: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data, error: null });

  return query;
}

function recapRow(competition: Competition) {
  return {
    content_md: "レビュー本文",
    generated_at: "2026-09-06T00:00:00.000Z",
    match_id: "match-1",
    match: {
      away_team: { name: "Away" },
      competition,
      home_team: { name: "Home" },
    },
  };
}

describe("published recap feed queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not duplicate a season already included in the competition name", async () => {
    const query = createQuery([
      recapRow({
        family: "lipovitan-challenge-cup",
        name: "Lipovitan Challenge Cup 2026",
        name_ja: "リポビタンDチャレンジカップ2026",
        season: "2026",
        slug: "lipovitan-challenge-cup-2026",
      }),
    ]);
    dbMock.from.mockReturnValue(query);

    await expect(listPublishedRecapsForFeed()).resolves.toMatchObject([
      { competitionName: "リポビタンDチャレンジカップ2026" },
    ]);
  });

  it("appends a season when it is not present in the competition name", async () => {
    const query = createQuery([
      recapRow({
        family: "premiership",
        name: "Premiership Rugby",
        name_ja: "プレミアシップ",
        season: "2026-27",
        slug: "premiership-2026-27",
      }),
    ]);
    dbMock.from.mockReturnValue(query);

    await expect(listPublishedRecapsForFeed()).resolves.toMatchObject([
      { competitionName: "プレミアシップ 2026-27" },
    ]);
  });

  it("uses the family Japanese name when name_ja is absent", async () => {
    const query = createQuery([
      recapRow({
        family: "nations-championship",
        name: "Nations Championship",
        name_ja: null,
        season: "2026",
        slug: "nations-championship-2026",
      }),
    ]);
    dbMock.from.mockReturnValue(query);

    await expect(listPublishedRecapsForFeed()).resolves.toMatchObject([
      { competitionName: "ネーションズチャンピオンシップ 2026" },
    ]);
  });

  it("falls back to the competition name when no Japanese name exists", async () => {
    const query = createQuery([
      recapRow({
        family: "unknown-family",
        name: "Unknown Cup",
        name_ja: null,
        season: "2026",
        slug: "unknown-cup-2026",
      }),
    ]);
    dbMock.from.mockReturnValue(query);

    await expect(listPublishedRecapsForFeed()).resolves.toMatchObject([
      { competitionName: "Unknown Cup 2026" },
    ]);
  });

  it("selects family and slug for the shared competition formatter", async () => {
    const query = createQuery([]);
    dbMock.from.mockReturnValue(query);

    await listPublishedRecapsForFeed();

    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("family"),
    );
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("slug"),
    );
  });
});
