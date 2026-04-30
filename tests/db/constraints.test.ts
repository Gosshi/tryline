import { beforeAll, describe, expect, it } from "vitest";

import {
  createAnonClient,
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
} from "./helpers";

describe("database constraints and defaults", () => {
  beforeAll(() => {
    ensureSupabaseTestEnvironment();
  });

  it("rejects matches where the home and away teams are the same", async () => {
    const { competitionId, homeTeamId, service } = await insertMatchFixture();
    const result = await service.from("matches").insert({
      competition_id: competitionId,
      home_team_id: homeTeamId,
      away_team_id: homeTeamId,
      kickoff_at: new Date(Date.now() + 60_000).toISOString(),
      status: "scheduled",
    });

    expect(result.error).not.toBeNull();
  });

  it("sets expires_at on match_raw_data seven days after insert", async () => {
    const { matchId, service } = await insertMatchFixture();
    const { data, error } = await service
      .from("match_raw_data")
      .insert({
        match_id: matchId,
        source: "espn",
        source_url: "https://example.com/raw",
        payload: { html: "<html></html>" },
      })
      .select("fetched_at, expires_at")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const fetchedAt = new Date(data!.fetched_at).getTime();
    const expiresAt = new Date(data!.expires_at).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresAt - fetchedAt).toBeGreaterThanOrEqual(sevenDaysMs - 5_000);
    expect(expiresAt - fetchedAt).toBeLessThanOrEqual(sevenDaysMs + 5_000);
  });

  it("allows anonymous clients to read public rugby tables", async () => {
    const { matchId, homeTeamId, service } = await insertMatchFixture();

    const eventInsert = await service.from("match_events").insert({
      match_id: matchId,
      minute: 12,
      type: "try",
      team_id: homeTeamId,
      metadata: { source: "manual-test" },
    });

    expect(eventInsert.error).toBeNull();

    const standingsInsert = await service.from("competition_standings").insert({
      competition_id: (
        await service
          .from("matches")
          .select("competition_id")
          .eq("id", matchId)
          .single()
      ).data!.competition_id,
      team_id: homeTeamId,
      position: 1,
    });

    expect(standingsInsert.error).toBeNull();

    const anon = createAnonClient();
    const competitions = await anon.from("competitions").select("id");
    const teams = await anon.from("teams").select("id");
    const matches = await anon.from("matches").select("id");
    const matchEvents = await anon.from("match_events").select("id");
    const matchLineups = await anon.from("match_lineups").select("id");
    const competitionStandings = await anon
      .from("competition_standings")
      .select("id");

    expect(competitions.error).toBeNull();
    expect(teams.error).toBeNull();
    expect(matches.error).toBeNull();
    expect(matchEvents.error).toBeNull();
    expect(matchLineups.error).toBeNull();
    expect(competitionStandings.error).toBeNull();
  });
});
