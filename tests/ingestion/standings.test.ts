import { beforeAll, describe, expect, it, vi } from "vitest";

import { upsertCompetitionStandings } from "@/lib/ingestion/standings";

import {
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
} from "../db/helpers";

describe("upsertCompetitionStandings", () => {
  beforeAll(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  it("upserts by competition and team and skips unknown teams", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { competitionId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();
    const rows = [
      {
        bonusPointsLosing: 0,
        bonusPointsTry: 1,
        drawn: 0,
        lost: 0,
        played: 0,
        pointsAgainst: 0,
        pointsFor: 0,
        position: 1,
        teamName: "Home",
        totalPoints: 0,
        triesFor: 0,
        won: 0,
      },
      {
        bonusPointsLosing: 1,
        bonusPointsTry: 0,
        drawn: 0,
        lost: 1,
        played: 1,
        pointsAgainst: 30,
        pointsFor: 24,
        position: 2,
        teamName: "Away",
        totalPoints: 1,
        triesFor: 0,
        won: 0,
      },
      {
        bonusPointsLosing: 0,
        bonusPointsTry: 0,
        drawn: 0,
        lost: 0,
        played: 0,
        pointsAgainst: 0,
        pointsFor: 0,
        position: 3,
        teamName: "Unknown",
        totalPoints: 0,
        triesFor: 0,
        won: 0,
      },
    ];

    const first = await upsertCompetitionStandings({
      competitionId,
      rows,
      teamLookup: { Away: awayTeamId, Home: homeTeamId },
    });
    const second = await upsertCompetitionStandings({
      competitionId,
      rows: rows.map((row) => ({ ...row, totalPoints: row.totalPoints + 1 })),
      teamLookup: { Away: awayTeamId, Home: homeTeamId },
    });

    const stored = await service
      .from("competition_standings")
      .select("team_id, total_points")
      .eq("competition_id", competitionId);

    expect(first.upserted).toBe(2);
    expect(second.upserted).toBe(2);
    expect(stored.error).toBeNull();
    expect(stored.data).toHaveLength(2);
    expect(stored.data?.map((row) => row.total_points).sort()).toEqual([1, 2]);
    expect(warn).toHaveBeenCalledWith(
      "Skipping standings row because team is missing from seed data: Unknown",
    );

    warn.mockRestore();
  });
});
