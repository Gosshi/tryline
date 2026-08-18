import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

const broadcastsMock = vi.hoisted(() => ({
  getMatchBroadcastsForMatches: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));
vi.mock("@/lib/db/queries/match-broadcasts", () => broadcastsMock);

import {
  getMatchById,
  getNextMatchForTeamSlug,
  getNextMatchesForTeams,
  getRoundFromExternalIds,
  getRecentlyReviewedCompetitionGroups,
  getRecentlyReviewedMatches,
  getSingleNationCompetitionIds,
  listMatchesForCompetition,
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

describe("getRoundFromExternalIds", () => {
  it.each([
    [{ round: 3 }, 3],
    [{ wikipedia_round: "12" }, 12],
    [null, null],
    [{ round: "R1" }, null],
  ])("normalizes %j to %j", (externalIds, expected) => {
    expect(getRoundFromExternalIds(externalIds)).toBe(expected);
  });
});

const reviewQueryMock = {
  eq: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  order: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
};

const matchDetailQueryMock = {
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  select: vi.fn().mockReturnThis(),
};

const standingsQueryMock = {
  in: vi.fn(),
  select: vi.fn().mockReturnThis(),
};

const nextMatchesQueryMock = {
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  neq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
};

const teamBySlugQueryMock = {
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  select: vi.fn().mockReturnThis(),
};

const singleNationQueryMock = {
  in: vi.fn(),
  select: vi.fn().mockReturnThis(),
};

describe("getSingleNationCompetitionIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.from.mockReturnValue(singleNationQueryMock);
    singleNationQueryMock.select.mockReturnThis();
    singleNationQueryMock.in.mockResolvedValue({
      data: [
        {
          away_team: { country: "Japan" },
          competition_id: "league-one",
          home_team: { country: "Japan" },
        },
        {
          away_team: { country: null },
          competition_id: "league-one",
          home_team: { country: "Japan" },
        },
        {
          away_team: { country: "New Zealand" },
          competition_id: "super-rugby-pacific",
          home_team: { country: "New Zealand" },
        },
        {
          away_team: { country: "Australia" },
          competition_id: "super-rugby-pacific",
          home_team: { country: "Fiji" },
        },
        {
          away_team: { country: "France" },
          competition_id: "six-nations",
          home_team: { country: "Ireland" },
        },
      ],
      error: null,
    });
  });

  it("returns only competitions whose participating teams have one country", async () => {
    await expect(
      getSingleNationCompetitionIds([
        "league-one",
        "super-rugby-pacific",
        "six-nations",
        "league-one",
      ]),
    ).resolves.toEqual(new Set(["league-one"]));

    expect(clientMock.from).toHaveBeenCalledWith("matches");
    expect(singleNationQueryMock.select).toHaveBeenCalledWith(
      expect.stringContaining("competition_id"),
    );
    expect(singleNationQueryMock.in).toHaveBeenCalledWith("competition_id", [
      "league-one",
      "super-rugby-pacific",
      "six-nations",
    ]);
  });

  it("does not query when no competition IDs are supplied", async () => {
    await expect(getSingleNationCompetitionIds([])).resolves.toEqual(new Set());

    expect(clientMock.from).not.toHaveBeenCalled();
  });
});

describe("getNextMatchesForTeams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.from.mockReturnValue(nextMatchesQueryMock);
    nextMatchesQueryMock.eq.mockReturnThis();
    nextMatchesQueryMock.gte.mockReturnThis();
    nextMatchesQueryMock.neq.mockReturnThis();
    nextMatchesQueryMock.or.mockReturnThis();
    nextMatchesQueryMock.order.mockReturnThis();
    nextMatchesQueryMock.select.mockReturnThis();
    nextMatchesQueryMock.limit.mockResolvedValue({ data: [], error: null });
  });

  it("skips the UUID exclusion filter when no match is being excluded", async () => {
    await getNextMatchesForTeams({
      afterIso: "2026-07-21T00:00:00.000Z",
      teamIds: ["team-1"],
    });

    expect(nextMatchesQueryMock.neq).not.toHaveBeenCalled();
    expect(nextMatchesQueryMock.gte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-07-21T00:00:00.000Z",
    );
  });

  it("keeps the exclusion filter for a supplied match ID", async () => {
    await getNextMatchesForTeams({
      afterIso: "2026-07-21T00:00:00.000Z",
      excludeMatchId: "00000000-0000-0000-0000-000000000001",
      teamIds: ["team-1"],
    });

    expect(nextMatchesQueryMock.neq).toHaveBeenCalledWith(
      "id",
      "00000000-0000-0000-0000-000000000001",
    );
  });
});

describe("getNextMatchForTeamSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.from.mockImplementation((table: string) =>
      table === "teams" ? teamBySlugQueryMock : nextMatchesQueryMock,
    );
    teamBySlugQueryMock.eq.mockReturnThis();
    teamBySlugQueryMock.select.mockReturnThis();
    nextMatchesQueryMock.eq.mockReturnThis();
    nextMatchesQueryMock.gte.mockReturnThis();
    nextMatchesQueryMock.or.mockReturnThis();
    nextMatchesQueryMock.order.mockReturnThis();
    nextMatchesQueryMock.select.mockReturnThis();
  });

  it("resolves a team slug and returns its nearest match after the supplied time", async () => {
    teamBySlugQueryMock.maybeSingle.mockResolvedValue({
      data: {
        id: "japan-id",
        name: "Japan",
        short_code: "JPN",
        slug: "japan",
      },
      error: null,
    });
    nextMatchesQueryMock.limit.mockResolvedValue({
      data: [
        {
          away_score: null,
          away_team: {
            id: "australia-id",
            name: "Australia",
            short_code: "AUS",
            slug: "australia",
          },
          away_team_id: "australia-id",
          competition: {
            family: "lipovitan-challenge-cup",
            id: "lipovitan-2026-id",
            name: "Lipovitan Challenge Cup",
            name_ja: null,
            season: "2026",
            slug: "lipovitan-challenge-cup-2026",
          },
          external_ids: {},
          home_score: null,
          home_team: {
            id: "japan-id",
            name: "Japan",
            short_code: "JPN",
            slug: "japan",
          },
          home_team_id: "japan-id",
          id: "japan-australia",
          kickoff_at: "2026-08-08T10:00:00.000Z",
          status: "scheduled",
          venue: null,
        },
      ],
      error: null,
    });

    const match = await getNextMatchForTeamSlug(
      "japan",
      "2026-07-21T00:00:00.000Z",
    );

    expect(teamBySlugQueryMock.eq).toHaveBeenCalledWith("slug", "japan");
    expect(nextMatchesQueryMock.gte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-07-21T00:00:00.000Z",
    );
    expect(match).toMatchObject({
      id: "japan-australia",
      competition: {
        family: "lipovitan-challenge-cup",
        season: "2026",
      },
    });
  });

  it("returns null when the team slug is not found", async () => {
    teamBySlugQueryMock.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(
      getNextMatchForTeamSlug("missing", "2026-07-21T00:00:00.000Z"),
    ).resolves.toBeNull();
    expect(nextMatchesQueryMock.select).not.toHaveBeenCalled();
  });
});

describe("listMatchesForCompetition", () => {
  it("includes each team's kind for schedule match classification", async () => {
    const competitionQuery = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "greatest-rivalry-2026-id" },
        error: null,
      }),
      select: vi.fn().mockReturnThis(),
    };
    const matchesQuery = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            away_score: null,
            away_team: {
              flag_code: "🇳🇿",
              kind: "national",
              name: "New Zealand",
              short_code: "NZL",
              slug: "new-zealand",
            },
            external_ids: {},
            home_score: null,
            home_team: {
              flag_code: "🇿🇦",
              kind: "club",
              name: "Stormers",
              short_code: "STO",
              slug: "stormers",
            },
            id: "stormers-new-zealand",
            kickoff_at: "2026-08-07T15:00:00.000Z",
            status: "finished",
            venue: "Cape Town Stadium",
          },
        ],
        error: null,
      }),
      select: vi.fn().mockReturnThis(),
    };
    clientMock.from
      .mockReturnValueOnce(competitionQuery)
      .mockReturnValueOnce(matchesQuery);

    await expect(
      listMatchesForCompetition("greatest-rivalry-2026"),
    ).resolves.toMatchObject([
      {
        awayTeam: { kind: "national" },
        homeTeam: { kind: "club" },
      },
    ]);

    expect(matchesQuery.select).toHaveBeenCalledWith(
      expect.stringContaining("kind"),
    );
  });
});

describe("getMatchById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.from.mockReturnValue(matchDetailQueryMock);
    matchDetailQueryMock.eq.mockReturnThis();
    matchDetailQueryMock.maybeSingle.mockResolvedValue({
      data: {
        away_score: null,
        away_team: {
          english_name: null,
          flag_code: "🇫🇷",
          name: "France",
          short_code: "FRA",
          slug: "france",
        },
        away_team_id: "france-id",
        broadcast_jp_url: "https://example.com/watch/ireland-france",
        competition: {
          family: "six-nations",
          name: "Six Nations",
          season: "2027",
          slug: "six-nations-2027",
        },
        external_ids: { wikipedia_round: 1 },
        home_score: null,
        home_team: {
          english_name: null,
          flag_code: "🇮🇪",
          name: "Ireland",
          short_code: "IRL",
          slug: "ireland",
        },
        home_team_id: "ireland-id",
        id: "match-detail",
        kickoff_at: "2027-02-06T15:00:00.000Z",
        status: "scheduled",
        venue: "Aviva Stadium",
      },
      error: null,
    });
    broadcastsMock.getMatchBroadcastsForMatches.mockResolvedValue(
      new Map([
        [
          "match-detail",
          [
            {
              displayOrder: 0,
              kind: "tv",
              serviceName: "WOWOW プライム",
              sourceUrl: null,
              url: "https://example.com/wowow",
              verifiedAt: "2026-07-15T12:00:00.000Z",
            },
          ],
        ],
      ]),
    );
  });

  it("selects and maps the stored Japanese broadcast URL and structured broadcasts", async () => {
    const match = await getMatchById("match-detail");

    expect(clientMock.from).toHaveBeenCalledWith("matches");
    expect(matchDetailQueryMock.select).toHaveBeenCalledWith(
      expect.stringContaining("broadcast_jp_url"),
    );
    expect(matchDetailQueryMock.select).toHaveBeenCalledWith(
      expect.stringContaining("name_ja"),
    );
    expect(matchDetailQueryMock.select).toHaveBeenCalledWith(
      expect.stringContaining("flag_code"),
    );
    expect(matchDetailQueryMock.eq).toHaveBeenCalledWith("id", "match-detail");
    expect(match).toMatchObject({
      awayTeam: {
        flagCode: "🇫🇷",
        shortCode: "FRA",
      },
      broadcastJpUrl: "https://example.com/watch/ireland-france",
      broadcasts: [
        {
          kind: "tv",
          serviceName: "WOWOW プライム",
          url: "https://example.com/wowow",
        },
      ],
      homeTeam: {
        flagCode: "🇮🇪",
        shortCode: "IRL",
      },
      id: "match-detail",
    });
    expect(broadcastsMock.getMatchBroadcastsForMatches).toHaveBeenCalledWith([
      "match-detail",
    ]);
  });
});

function isoDaysAgo(days: number, minutes = 0) {
  return new Date(
    Date.now() - days * 24 * 60 * 60 * 1000 - minutes * 60 * 1000,
  ).toISOString();
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
        {
          competition_id: "srp-2026-id",
          position: 1,
          team_id: "hurricanes-id",
        },
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
