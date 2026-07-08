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
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: dbMock.from,
  }),
}));

function createMatchRow(params: {
  competitionName?: string;
  id: string;
  kickoffAt: string;
  status: string;
}) {
  return {
    away_score: params.status === "finished" ? 19 : null,
    away_team: {
      name: "Kobe Steelers",
      short_code: "KOB",
      slug: "kobe-steelers",
    },
    competition: params.competitionName
      ? {
          family: "league-one",
          name: params.competitionName,
          season: "2025-26",
          slug: `league-one-${params.competitionName}`,
        }
      : null,
    external_ids: {},
    home_score: params.status === "finished" ? 24 : null,
    home_team: {
      name: "Kubota Spears",
      short_code: "KUB",
      slug: "kubota-spears",
    },
    id: params.id,
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
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return dbMock.matchesBuilder;
      if (table === "match_content") return dbMock.contentBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("returns mixed statuses in range with preview and recap flags", async () => {
    dbMock.matchRows = [
      createMatchRow({
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
    expect(matches.find((match) => match.id === "match-finished")).toMatchObject(
      {
        hasPreview: false,
        hasRecap: true,
      },
    );
    expect(matches.find((match) => match.id === "match-scheduled")).toMatchObject(
      {
        hasPreview: true,
        hasRecap: false,
      },
    );
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
});
