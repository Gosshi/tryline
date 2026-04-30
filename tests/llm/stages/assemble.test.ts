import { beforeAll, describe, expect, it } from "vitest";

import { assembleMatchContentInput } from "@/lib/llm/stages/assemble";
import {
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
} from "@/tests/db/helpers";

describe("assembleMatchContentInput", () => {
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

  it("uses match_lineups when announced lineups exist", async () => {
    const { matchId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();

    const { data: players } = await service
      .from("players")
      .insert([
        {
          team_id: homeTeamId,
          name: "Home Starter",
          position: "Prop",
          caps: 1,
        },
        {
          team_id: awayTeamId,
          name: "Away Starter",
          position: "Hooker",
          caps: 2,
        },
      ])
      .select("id, name, team_id");

    const homePlayerId = players?.find(
      (player) => player.team_id === homeTeamId,
    )?.id;
    const awayPlayerId = players?.find(
      (player) => player.team_id === awayTeamId,
    )?.id;

    await service.from("match_lineups").insert([
      {
        match_id: matchId,
        team_id: homeTeamId,
        player_id: homePlayerId!,
        jersey_number: 1,
        source_url: "https://example.com",
      },
      {
        match_id: matchId,
        team_id: awayTeamId,
        player_id: awayPlayerId!,
        jersey_number: 16,
        source_url: "https://example.com",
      },
    ]);

    const result = await assembleMatchContentInput(matchId);

    expect(result.projected_lineups.home[0]).toMatchObject({
      name: "Home Starter",
      jersey_number: 1,
      is_starter: true,
    });
    expect(result.projected_lineups.away[0]).toMatchObject({
      name: "Away Starter",
      jersey_number: 16,
      is_starter: false,
    });
  });

  it("falls back to players when match_lineups are empty", async () => {
    const { matchId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();

    await service.from("players").insert([
      { team_id: homeTeamId, name: "Home Veteran", position: "Lock", caps: 20 },
      { team_id: homeTeamId, name: "Home Rookie", position: "Wing", caps: 1 },
      {
        team_id: awayTeamId,
        name: "Away Veteran",
        position: "Scrum-half",
        caps: 15,
      },
    ]);

    const result = await assembleMatchContentInput(matchId);

    expect(result.projected_lineups.home[0]).toMatchObject({
      name: "Home Veteran",
      jersey_number: null,
      is_starter: null,
    });
    expect(result.projected_lineups.home[1]?.name).toBe("Home Rookie");
    expect(result.projected_lineups.away[0]).toMatchObject({
      name: "Away Veteran",
      jersey_number: null,
      is_starter: null,
    });
  });

  it("returns empty arrays when both match_lineups and players are empty", async () => {
    const { matchId } = await insertMatchFixture();

    const result = await assembleMatchContentInput(matchId);

    expect(result.match_events).toEqual([]);
    expect(result.projected_lineups.home).toEqual([]);
    expect(result.projected_lineups.away).toEqual([]);
    expect(result.competition_standings).toEqual([]);
  });

  it("loads match_events for finished matches only", async () => {
    const { matchId, homeTeamId, service } = await insertMatchFixture();

    await service.from("match_events").insert({
      match_id: matchId,
      minute: 12,
      team_id: homeTeamId,
      type: "try",
      metadata: {
        player_name: "Home Scorer",
      },
    });

    const scheduledResult = await assembleMatchContentInput(matchId);

    expect(scheduledResult.match_events).toEqual([]);

    await service
      .from("matches")
      .update({
        away_score: 0,
        home_score: 7,
        status: "finished",
      })
      .eq("id", matchId);

    const finishedResult = await assembleMatchContentInput(matchId);

    expect(finishedResult.match_events).toEqual([
      {
        minute: 12,
        player_name: "Home Scorer",
        team_name: expect.stringMatching(/^Home /),
        type: "try",
      },
    ]);
  });

  it("returns competition standings sorted by position", async () => {
    const { matchId, competitionId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();

    const standingsInsert = await service.from("competition_standings").insert([
      {
        competition_id: competitionId,
        team_id: awayTeamId,
        position: 2,
        played: 1,
        won: 0,
        drawn: 0,
        lost: 1,
        points_for: 12,
        points_against: 18,
        bonus_points_try: 0,
        bonus_points_losing: 1,
        total_points: 1,
      },
      {
        competition_id: competitionId,
        team_id: homeTeamId,
        position: 1,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        points_for: 18,
        points_against: 12,
        bonus_points_try: 1,
        bonus_points_losing: 0,
        total_points: 5,
      },
    ]);

    expect(standingsInsert.error).toBeNull();

    const result = await assembleMatchContentInput(matchId);

    expect(result.competition_standings).toMatchObject([
      {
        position: 1,
        played: 1,
        won: 1,
        total_points: 5,
      },
      {
        position: 2,
        played: 1,
        lost: 1,
        total_points: 1,
      },
    ]);
  });
});
