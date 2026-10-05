import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

function query(result: unknown) {
  const value = Promise.resolve(result);
  return {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: value.then.bind(value),
  };
}
const matches = [
  {
    id: "match-1",
    home_team_id: "home",
    away_team_id: "away",
    home_score: 25,
    away_score: 20,
  },
  {
    id: "match-2",
    home_team_id: "home",
    away_team_id: "away",
    home_score: 20,
    away_score: 20,
  },
  {
    id: "match-3",
    home_team_id: "home",
    away_team_id: "away",
    home_score: 30,
    away_score: 10,
  },
];
function setup(eventMatchIds: string[], finishedMatches = matches) {
  const events = eventMatchIds.flatMap((matchId) => [
    ...Array.from({ length: matchId === "match-2" ? 2 : 4 }, () => ({
      match_id: matchId,
      team_id: "home",
      type: "try",
    })),
    ...Array.from({ length: matchId === "match-2" ? 2 : 1 }, () => ({
      match_id: matchId,
      team_id: "away",
      type: "try",
    })),
  ]);
  mocks.upsert.mockReturnValue(
    query({
      data: [{ id: "standing-home" }, { id: "standing-away" }],
      error: null,
    }),
  );
  mocks.from.mockImplementation((table: string) => {
    if (table === "competitions")
      return query({
        data: { family: "top-14", id: "competition", slug: "top-14-2026-27" },
        error: null,
      });
    if (table === "competition_teams") return query({ data: [], error: null });
    if (table === "matches")
      return query({ data: finishedMatches, error: null });
    if (table === "match_events") return query({ data: events, error: null });
    if (table === "competition_standings") return { upsert: mocks.upsert };
    throw new Error(`unexpected table: ${table}`);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe("calculateStandings missing events gate", () => {
  it("skips all writes when one of three finished matches has no events", async () => {
    setup(["match-1", "match-2"]);
    const { calculateStandings } =
      await import("@/scripts/calculate-standings");
    await expect(calculateStandings("top-14-2026-27")).resolves.toEqual({
      status: "skipped",
      reason: "events_pending",
      pendingMatchIds: ["match-3"],
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith("competition_standings");
  });
  it("returns every pending match without writing an incomplete table", async () => {
    setup(["match-2"]);
    const { calculateStandings } =
      await import("@/scripts/calculate-standings");
    await expect(calculateStandings("top-14-2026-27")).resolves.toEqual({
      status: "skipped",
      reason: "events_pending",
      pendingMatchIds: ["match-1", "match-3"],
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("calculates and upserts the same three matches once all events are available", async () => {
    setup(["match-1", "match-2", "match-3"]);
    const { calculateStandings } =
      await import("@/scripts/calculate-standings");
    await expect(calculateStandings("top-14-2026-27")).resolves.toMatchObject({
      status: "updated",
      result: { upserted: 2 },
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          team_id: "home",
          played: 3,
          won: 2,
          drawn: 1,
          bonus_points_try: 2,
          total_points: 12,
        }),
        expect.objectContaining({
          team_id: "away",
          played: 3,
          lost: 2,
          drawn: 1,
          bonus_points_losing: 1,
          total_points: 3,
        }),
      ]),
      { onConflict: "competition_id,team_id" },
    );
  });
  it("preserves the empty preseason result without events_pending", async () => {
    setup([], []);
    const { calculateStandings } =
      await import("@/scripts/calculate-standings");
    await expect(calculateStandings("top-14-2026-27")).resolves.toMatchObject({
      status: "updated",
      matches: [],
      rows: [],
      result: { upserted: 0 },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("propagates pending through calculation of the latest Top 14 season", async () => {
    setup(["match-1", "match-2"]);
    const { calculateLatestTop14Standings } =
      await import("@/scripts/calculate-standings");
    await expect(calculateLatestTop14Standings()).resolves.toEqual({
      competitionSlug: "top-14-2026-27",
      status: "skipped",
      reason: "events_pending",
      pendingMatchIds: ["match-3"],
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
