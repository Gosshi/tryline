import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

import {
  getRecentlyReviewedCompetitionGroups,
  getRecentlyReviewedMatches,
  stripMarkdown,
} from "@/lib/db/queries/matches";

describe("stripMarkdown", () => {
  it("removes headings, bullets, and bold markers for recap excerpts", () => {
    const text = `# 試合全体像

- **Bath** が前半で主導権を握った

### ターニングポイント

**後半** は規律で差がついた。`;

    expect(stripMarkdown(text)).toBe(
      `試合全体像
Bath が前半で主導権を握った

ターニングポイント

後半 は規律で差がついた。`,
    );
  });

  it("collapses triple newlines", () => {
    expect(stripMarkdown("本文\n\n\n\n次段落")).toBe("本文\n\n次段落");
  });
});

const reviewQueryMock = {
  eq: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  order: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
};

const standingsQueryMock = {
  in: vi.fn(),
  select: vi.fn().mockReturnThis(),
};

function isoDaysAgo(days: number, minutes = 0) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - minutes * 60 * 1000)
    .toISOString();
}

function buildReviewedContentRow(params: {
  awayTeamId?: string;
  awayWorldRanking?: number | null;
  competitionId?: string;
  family?: string;
  generatedAt: string;
  homeTeamId?: string;
  homeWorldRanking?: number | null;
  id: string;
  round?: number | string | null;
  season?: string;
}) {
  const family = params.family ?? "nations-championship";
  const season = params.season ?? "2026";
  const competitionId = params.competitionId ?? `${family}-${season}-id`;
  const homeTeamId = params.homeTeamId ?? `${params.id}-home-id`;
  const awayTeamId = params.awayTeamId ?? `${params.id}-away-id`;

  return {
    content_md: `# Review\n\nRecap for ${params.id}.`,
    generated_at: params.generatedAt,
    match: {
      away_score: 10,
      away_team: {
        id: awayTeamId,
        name: "Away Team",
        short_code: "AWY",
        slug: "away-team",
        world_ranking: params.awayWorldRanking ?? null,
      },
      competition: {
        id: competitionId,
        family,
        name: "Nations Championship",
        name_ja: null,
        season,
        slug: `${family}-${season}`,
      },
      external_ids:
        params.round === undefined || params.round === null
          ? {}
          : { wikipedia_round: params.round },
      home_score: 20,
      home_team: {
        id: homeTeamId,
        name: "Home Team",
        short_code: "HOM",
        slug: "home-team",
        world_ranking: params.homeWorldRanking ?? null,
      },
      id: params.id,
      kickoff_at: "2026-07-04T07:10:00.000Z",
      status: "finished",
      venue: "National Stadium",
    },
  };
}

describe("recently reviewed match queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.from.mockImplementation((table: string) => {
      if (table === "competition_standings") {
        return standingsQueryMock;
      }

      return reviewQueryMock;
    });
    reviewQueryMock.eq.mockReturnThis();
    reviewQueryMock.order.mockReturnThis();
    reviewQueryMock.select.mockReturnThis();
    standingsQueryMock.select.mockReturnThis();
    standingsQueryMock.in.mockResolvedValue({ data: [], error: null });
  });

  it("returns every published review from the latest competition season", async () => {
    const latestRoundRows = Array.from({ length: 6 }, (_, index) =>
      buildReviewedContentRow({
        generatedAt: isoDaysAgo(1, index),
        id: `nations-round-1-${index + 1}`,
        round: "1",
      }),
    );
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        ...latestRoundRows,
        buildReviewedContentRow({
          family: "top-14",
          generatedAt: isoDaysAgo(1, 40),
          id: "top14-other-round",
          round: 1,
          season: "2025-26",
        }),
        buildReviewedContentRow({
          generatedAt: isoDaysAgo(1, 50),
          id: "nations-round-2",
          round: 2,
        }),
      ],
      error: null,
    });

    const matches = await getRecentlyReviewedMatches("ja");

    expect(clientMock.from).toHaveBeenCalledWith("match_content");
    expect(reviewQueryMock.eq).toHaveBeenCalledWith("language", "ja");
    expect(reviewQueryMock.limit).toHaveBeenCalledWith(40);
    expect(matches.map((match) => match.id)).toEqual([
      "nations-round-1-1",
      "nations-round-1-2",
      "nations-round-1-3",
      "nations-round-1-4",
      "nations-round-1-5",
      "nations-round-1-6",
      "nations-round-2",
    ]);
  });

  it("keeps roundless reviews in the same competition group", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        buildReviewedContentRow({
          generatedAt: isoDaysAgo(1),
          id: "roundless-latest",
          round: null,
        }),
        buildReviewedContentRow({
          generatedAt: isoDaysAgo(1, 10),
          id: "same-family-round-1",
          round: 1,
        }),
      ],
      error: null,
    });

    const matches = await getRecentlyReviewedMatches();

    expect(matches.map((match) => match.id)).toEqual([
      "roundless-latest",
      "same-family-round-1",
    ]);
  });

  it("caps unusually large competition groups at twelve reviews", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: Array.from({ length: 14 }, (_, index) =>
        buildReviewedContentRow({
          generatedAt: isoDaysAgo(1, index),
          id: `oversized-competition-${index + 1}`,
          round: index < 7 ? 1 : 2,
        }),
      ),
      error: null,
    });

    const matches = await getRecentlyReviewedMatches();

    expect(matches).toHaveLength(12);
    expect(matches.map((match) => match.id)).toEqual([
      "oversized-competition-1",
      "oversized-competition-2",
      "oversized-competition-3",
      "oversized-competition-4",
      "oversized-competition-5",
      "oversized-competition-6",
      "oversized-competition-7",
      "oversized-competition-8",
      "oversized-competition-9",
      "oversized-competition-10",
      "oversized-competition-11",
      "oversized-competition-12",
    ]);
  });

  it("merges multiple active rounds from the same competition into one group", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        buildReviewedContentRow({
          awayWorldRanking: 9,
          generatedAt: isoDaysAgo(1),
          homeWorldRanking: 7,
          id: "round-2-latest",
          round: 2,
        }),
        buildReviewedContentRow({
          awayWorldRanking: 4,
          generatedAt: isoDaysAgo(1, 10),
          homeWorldRanking: 2,
          id: "round-1-level-hero",
          round: 1,
        }),
        buildReviewedContentRow({
          awayWorldRanking: 12,
          generatedAt: isoDaysAgo(1, 20),
          homeWorldRanking: 10,
          id: "roundless-same-competition",
          round: null,
        }),
      ],
      error: null,
    });

    const groups = await getRecentlyReviewedCompetitionGroups("ja");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.competition).toMatchObject({
      family: "nations-championship",
      season: "2026",
    });
    expect(groups[0]?.hero.id).toBe("round-1-level-hero");
    expect(groups[0]?.compact.map((match) => match.id)).toEqual([
      "round-2-latest",
      "roundless-same-competition",
    ]);
    expect(groups[0]?.latestReviewAt).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });

  it("returns active groups for multiple competitions and uses world rankings for the hero", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        buildReviewedContentRow({
          awayWorldRanking: 9,
          generatedAt: isoDaysAgo(1),
          homeWorldRanking: 7,
          id: "japan-italy-latest",
          round: 1,
        }),
        buildReviewedContentRow({
          awayWorldRanking: 4,
          generatedAt: isoDaysAgo(1, 10),
          homeWorldRanking: 2,
          id: "nz-france-level-hero",
          round: 1,
        }),
        buildReviewedContentRow({
          competitionId: "srp-2026-id",
          family: "super-rugby-pacific",
          generatedAt: isoDaysAgo(2),
          homeTeamId: "hurricanes-id",
          awayTeamId: "chiefs-id",
          id: "srp-round-hero",
          round: 12,
          season: "2026",
        }),
      ],
      error: null,
    });
    standingsQueryMock.in.mockResolvedValue({
      data: [
        { competition_id: "srp-2026-id", position: 1, team_id: "hurricanes-id" },
        { competition_id: "srp-2026-id", position: 2, team_id: "chiefs-id" },
      ],
      error: null,
    });

    const groups = await getRecentlyReviewedCompetitionGroups("ja");

    expect(groups).toHaveLength(2);
    expect(groups[0]?.hero.id).toBe("nz-france-level-hero");
    expect(groups[0]?.compact.map((match) => match.id)).toEqual([
      "japan-italy-latest",
    ]);
    expect(groups[1]?.hero.id).toBe("srp-round-hero");
  });

  it("uses standings positions for club groups and falls back to generated order without level data", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        buildReviewedContentRow({
          competitionId: "top14-id",
          family: "top-14",
          generatedAt: isoDaysAgo(1),
          homeTeamId: "lower-home-id",
          awayTeamId: "lower-away-id",
          id: "top14-latest",
          round: 8,
          season: "2025-26",
        }),
        buildReviewedContentRow({
          competitionId: "top14-id",
          family: "top-14",
          generatedAt: isoDaysAgo(1, 10),
          homeTeamId: "top-home-id",
          awayTeamId: "top-away-id",
          id: "top14-standings-hero",
          round: 8,
          season: "2025-26",
        }),
        buildReviewedContentRow({
          competitionId: "league-one-id",
          family: "league-one",
          generatedAt: isoDaysAgo(1, 20),
          id: "league-one-latest-fallback",
          round: 2,
          season: "2025-26",
        }),
        buildReviewedContentRow({
          competitionId: "league-one-id",
          family: "league-one",
          generatedAt: isoDaysAgo(1, 30),
          id: "league-one-older-fallback",
          round: 2,
          season: "2025-26",
        }),
      ],
      error: null,
    });
    standingsQueryMock.in.mockResolvedValue({
      data: [
        { competition_id: "top14-id", position: 9, team_id: "lower-home-id" },
        { competition_id: "top14-id", position: 10, team_id: "lower-away-id" },
        { competition_id: "top14-id", position: 1, team_id: "top-home-id" },
        { competition_id: "top14-id", position: 2, team_id: "top-away-id" },
      ],
      error: null,
    });

    const groups = await getRecentlyReviewedCompetitionGroups();

    expect(groups.map((group) => group.hero.id)).toEqual([
      "top14-standings-hero",
      "league-one-latest-fallback",
    ]);
  });

  it("omits competition groups whose latest review is outside the active window", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        buildReviewedContentRow({
          generatedAt: isoDaysAgo(1),
          id: "active-review",
          round: 1,
        }),
        buildReviewedContentRow({
          family: "urc",
          generatedAt: isoDaysAgo(9),
          id: "stale-review",
          round: 4,
          season: "2025-26",
        }),
      ],
      error: null,
    });

    const groups = await getRecentlyReviewedCompetitionGroups();

    expect(groups.map((group) => group.hero.id)).toEqual(["active-review"]);
  });
});
