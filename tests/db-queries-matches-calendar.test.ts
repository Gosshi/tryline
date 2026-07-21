import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  contentBuilder: {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
  from: vi.fn(),
  matchRows: [] as unknown[],
  matchesBuilder: {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
}));

const broadcastsMock = vi.hoisted(() => ({
  getMatchBroadcastPresenceForMatches: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: dbMock.from,
  }),
}));
vi.mock("@/lib/db/queries/match-broadcasts", () => broadcastsMock);

function createMatchRow(params: {
  broadcastJpUrl?: string | null;
  competitionName?: string;
  competitionSeason?: string;
  id: string;
  kickoffAt: string;
  status: string;
}) {
  return {
    away_score: params.status === "finished" ? 19 : null,
    away_team: {
      flag_code: "🇯🇵",
      name: "Kobe Steelers",
      short_code: "KOB",
      slug: "kobe-steelers",
    },
    competition: params.competitionName
      ? {
          family: "league-one",
          name: params.competitionName,
          season: params.competitionSeason ?? "2025-26",
          slug: `league-one-${params.competitionName}`,
        }
      : null,
    external_ids: {},
    home_score: params.status === "finished" ? 24 : null,
    home_team: {
      flag_code: "🇯🇵",
      name: "Kubota Spears",
      short_code: "KUB",
      slug: "kubota-spears",
    },
    id: params.id,
    broadcast_jp_url: params.broadcastJpUrl ?? null,
    kickoff_at: params.kickoffAt,
    status: params.status,
    venue: "National Stadium",
  };
}

describe("getMatchesInRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.matchesBuilder.then.mockImplementation((resolve) =>
      Promise.resolve(resolve({ data: dbMock.matchRows, error: null })),
    );
    dbMock.contentBuilder.then.mockImplementation((resolve) =>
      Promise.resolve(
        resolve({
          data: [
            { content_type: "recap", match_id: "match-finished" },
            { content_type: "preview", match_id: "match-scheduled" },
          ],
          error: null,
        }),
      ),
    );
    broadcastsMock.getMatchBroadcastPresenceForMatches.mockResolvedValue(
      new Set(["match-scheduled"]),
    );
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return dbMock.matchesBuilder;
      if (table === "match_content") return dbMock.contentBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("returns mixed statuses in range with preview and recap flags", async () => {
    dbMock.matchRows = [
      createMatchRow({
        broadcastJpUrl: "https://example.com/watch/match-scheduled",
        competitionName: "Z Competition",
        id: "match-scheduled",
        kickoffAt: "2026-06-07T16:00:00.000Z",
        status: "scheduled",
      }),
      createMatchRow({
        competitionName: "A Competition",
        id: "match-finished",
        kickoffAt: "2026-06-07T16:00:00.000Z",
        status: "finished",
      }),
      createMatchRow({
        competitionName: "Live Competition",
        id: "match-live",
        kickoffAt: "2026-06-08T09:00:00.000Z",
        status: "in_progress",
      }),
      createMatchRow({
        id: "match-no-competition",
        kickoffAt: "2026-06-08T10:00:00.000Z",
        status: "scheduled",
      }),
    ];
    const { getMatchesInRange } = await import("@/lib/db/queries/matches");

    const matches = await getMatchesInRange(
      "2026-06-07T15:00:00.000Z",
      "2026-06-14T15:00:00.000Z",
    );

    expect(dbMock.matchesBuilder.gte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-06-07T15:00:00.000Z",
    );
    expect(dbMock.matchesBuilder.lt).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-06-14T15:00:00.000Z",
    );
    expect(dbMock.matchesBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("broadcast_jp_url"),
    );
    expect(dbMock.matchesBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("flag_code"),
    );
    expect(matches.map((match) => match.id)).toEqual([
      "match-finished",
      "match-scheduled",
      "match-live",
    ]);
    expect(matches.map((match) => match.status)).toEqual([
      "finished",
      "scheduled",
      "in_progress",
    ]);
    expect(
      matches.find((match) => match.id === "match-finished"),
    ).toMatchObject({
      hasPreview: false,
      hasRecap: true,
    });
    expect(
      matches.find((match) => match.id === "match-scheduled"),
    ).toMatchObject({
      awayTeam: {
        flagCode: "🇯🇵",
        shortCode: "KOB",
      },
      broadcastJpUrl: "https://example.com/watch/match-scheduled",
      hasBroadcasts: true,
      homeTeam: {
        flagCode: "🇯🇵",
        shortCode: "KUB",
      },
      hasPreview: true,
      hasRecap: false,
    });
    expect(
      matches.find((match) => match.id === "match-finished"),
    ).toMatchObject({
      hasBroadcasts: false,
    });
    expect(dbMock.contentBuilder.eq).toHaveBeenCalledWith("language", "ja");
    expect(dbMock.contentBuilder.eq).toHaveBeenCalledWith(
      "status",
      "published",
    );
    expect(dbMock.contentBuilder.in).toHaveBeenCalledWith("content_type", [
      "preview",
      "recap",
    ]);
  });

  it("loads the next scheduled match for a competition beyond the homepage week pool", async () => {
    dbMock.matchRows = [
      createMatchRow({
        competitionName: "Pacific Nations Cup",
        competitionSeason: "2026",
        id: "pnc-september-next",
        kickoffAt: "2026-09-12T07:00:00.000Z",
        status: "scheduled",
      }),
    ];
    const { getNextMatchForCompetition } =
      await import("@/lib/db/queries/matches");

    const match = await getNextMatchForCompetition({
      family: "pnc",
      season: "2026",
    });

    expect(dbMock.matchesBuilder.eq).toHaveBeenCalledWith(
      "competition.family",
      "pnc",
    );
    expect(dbMock.matchesBuilder.eq).toHaveBeenCalledWith(
      "competition.season",
      "2026",
    );
    expect(dbMock.matchesBuilder.eq).toHaveBeenCalledWith(
      "status",
      "scheduled",
    );
    expect(dbMock.matchesBuilder.limit).toHaveBeenCalledWith(1);
    expect(match).toMatchObject({
      competition: {
        name: "Pacific Nations Cup",
        season: "2026",
      },
      id: "pnc-september-next",
      kickoffAt: "2026-09-12T07:00:00.000Z",
    });
  });

  it("loads the earliest scheduled match across competitions for a no-match homepage", async () => {
    dbMock.matchRows = [
      createMatchRow({
        competitionName: "Rugby Championship",
        competitionSeason: "2026",
        id: "earliest-upcoming-match",
        kickoffAt: "2026-08-15T07:00:00.000Z",
        status: "scheduled",
      }),
    ];
    const { getNextUpcomingMatch } = await import("@/lib/db/queries/matches");

    const match = await getNextUpcomingMatch();

    expect(dbMock.matchesBuilder.eq).toHaveBeenCalledWith(
      "status",
      "scheduled",
    );
    expect(dbMock.matchesBuilder.gte).toHaveBeenCalledWith(
      "kickoff_at",
      expect.any(String),
    );
    expect(dbMock.matchesBuilder.order).toHaveBeenCalledWith("kickoff_at", {
      ascending: true,
    });
    expect(dbMock.matchesBuilder.limit).toHaveBeenCalledWith(1);
    expect(dbMock.matchesBuilder.eq).not.toHaveBeenCalledWith(
      "competition.family",
      expect.anything(),
    );
    expect(match).toMatchObject({
      id: "earliest-upcoming-match",
      kickoffAt: "2026-08-15T07:00:00.000Z",
    });
  });
});
