import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  scrapeCompetitionStandings: vi.fn(),
  upsertCompetitionStandings: vi.fn(),
  countSelect: vi.fn(),
  countEq: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/scrapers/wikipedia-standings", () => ({
  scrapeCompetitionStandings: mocks.scrapeCompetitionStandings,
}));
vi.mock("@/lib/ingestion/standings", () => ({
  upsertCompetitionStandings: mocks.upsertCompetitionStandings,
}));
vi.mock("@/scripts/backfill-standings", () => ({
  SUPPORTED_FAMILIES: new Set(["autumn-nations"]),
  resolveWikipediaStandingsUrl: () => "https://example.invalid/standings",
  buildResolvedStandingsTeamLookup: () => ({ "Team A": "team-a" }),
  collectCompetitionTeamIds: () => new Set(["team-a"]),
  upsertCompetitionPoolsForStandings: vi.fn(),
  warnUnmatchedStandingsTeams: vi.fn(),
}));
import { ingestStandingsForFamily } from "@/lib/ingestion/weekly-standings";
function query(result: unknown) {
  const p = Promise.resolve(result);
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
  };
}
function setup(count: number | null, error: Error | null = null) {
  mocks.countSelect.mockImplementation((_columns, options) =>
    options?.head ? { eq: mocks.countEq } : query({ data: [], error: null }),
  );
  mocks.countEq.mockResolvedValue({ count, error });
  mocks.from.mockImplementation((table: string) => {
    if (table === "competitions")
      return query({
        data: {
          id: "competition",
          slug: "autumn-nations-2026",
          season: "2026",
        },
        error: null,
      });
    if (table === "matches") return { select: mocks.countSelect };
    if (table === "teams") return query({ data: [], error: null });
    throw new Error(`unexpected table: ${table}`);
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scrapeCompetitionStandings.mockResolvedValue([]);
});
describe("weekly standings zero match guard", () => {
  it("skips a competition with zero matches before fetching Wikipedia", async () => {
    setup(0);
    await expect(ingestStandingsForFamily("autumn-nations")).resolves.toEqual({
      competitionSlug: "autumn-nations-2026",
      season: "2026",
      family: "autumn-nations",
      status: "skipped",
      reason: "no_matches",
      matched: 0,
      parsed: 0,
      upserted: 0,
    });
    expect(mocks.countSelect).toHaveBeenCalledWith("id", {
      head: true,
      count: "exact",
    });
    expect(mocks.countEq).toHaveBeenCalledWith("competition_id", "competition");
    expect(mocks.scrapeCompetitionStandings).not.toHaveBeenCalled();
    expect(mocks.upsertCompetitionStandings).not.toHaveBeenCalled();
  });
  it("keeps the no_rows_parsed result for a competition with matches but no standings", async () => {
    setup(3);
    await expect(
      ingestStandingsForFamily("autumn-nations"),
    ).resolves.toMatchObject({ status: "skipped", reason: "no_rows_parsed" });
    expect(mocks.scrapeCompetitionStandings).toHaveBeenCalledTimes(1);
  });
  it("propagates count errors without fetching Wikipedia", async () => {
    setup(null, new Error("synthetic count error"));
    await expect(ingestStandingsForFamily("autumn-nations")).rejects.toThrow(
      "synthetic count error",
    );
    expect(mocks.scrapeCompetitionStandings).not.toHaveBeenCalled();
  });
  it("keeps ingesting parsed standings when matches exist", async () => {
    setup(3);
    mocks.scrapeCompetitionStandings.mockResolvedValue([
      { teamName: "Team A", position: 1, totalPoints: 5 },
    ]);
    mocks.upsertCompetitionStandings.mockResolvedValue({ upserted: 1 });
    await expect(
      ingestStandingsForFamily("autumn-nations"),
    ).resolves.toMatchObject({
      status: "updated",
      matched: 1,
      parsed: 1,
      upserted: 1,
    });
    expect(mocks.upsertCompetitionStandings).toHaveBeenCalledTimes(1);
  });
});
