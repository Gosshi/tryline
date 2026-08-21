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
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  it("adds the existing JST kickoff format without changing the stored UTC value", async () => {
    const { matchId, service } = await insertMatchFixture();
    const overnightUtc = "2026-08-22T15:10:00+00:00";

    await service
      .from("matches")
      .update({ kickoff_at: overnightUtc })
      .eq("id", matchId);

    const overnight = await assembleMatchContentInput(matchId);

    expect(overnight.match.kickoff_at).toBe(overnightUtc);
    expect(overnight.match.kickoff_at_jst).toBe("2026-08-23 (日) 00:10 JST");
    expect(overnight.match.kickoff_at_jst).not.toContain("2026-08-22");

    const daytimeUtc = "2026-08-23T05:00:00+00:00";
    await service
      .from("matches")
      .update({ kickoff_at: daytimeUtc })
      .eq("id", matchId);

    const daytime = await assembleMatchContentInput(matchId);

    expect(daytime.match.kickoff_at).toBe(daytimeUtc);
    expect(daytime.match.kickoff_at_jst).toBe("2026-08-23 (日) 14:00 JST");
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
    expect(result.projected_lineups.confirmed).toEqual({
      away: true,
      home: true,
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
    expect(result.projected_lineups.confirmed).toEqual({
      away: false,
      home: false,
    });
  });

  it("returns empty arrays when both match_lineups and players are empty", async () => {
    const { matchId } = await insertMatchFixture();

    const result = await assembleMatchContentInput(matchId);

    expect(result.match.competition?.family).toMatch(/^competition-/);
    expect(result.match_phase).toBeNull();
    expect(result.match_events).toEqual([]);
    expect(result.projected_lineups.home).toEqual([]);
    expect(result.projected_lineups.away).toEqual([]);
    expect(result.projected_lineups.confirmed).toEqual({
      away: false,
      home: false,
    });
    expect(result.competition_standings).toEqual([]);
  });

  it("builds a player glossary from team rosters for scheduled matches without events or lineups", async () => {
    const { matchId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();

    await service.from("players").insert([
      {
        team_id: homeTeamId,
        name: "Kippei Ishida",
        name_ja: "石田 吉平",
      },
      {
        team_id: awayTeamId,
        name: "Dylan Riley",
        name_ja: null,
      },
    ]);

    const result = await assembleMatchContentInput(matchId);

    expect(result.match_events).toEqual([]);
    expect(result.projected_lineups.confirmed).toEqual({
      away: false,
      home: false,
    });
    expect(
      result.japanese_name_glossary?.filter((entry) => entry.kind === "player"),
    ).toEqual([
      {
        japanese: "石田 吉平",
        kind: "player",
        source: "Kippei Ishida",
      },
    ]);
  });

  it("deduplicates player glossary entries shared by event, lineup, and roster sources", async () => {
    const { matchId, homeTeamId, service } = await insertMatchFixture();

    const { data: player, error: playerError } = await service
      .from("players")
      .insert({
        team_id: homeTeamId,
        name: "Kippei Ishida",
        name_ja: "石田 吉平",
      })
      .select("id")
      .single();

    expect(playerError).toBeNull();

    await service.from("match_lineups").insert({
      match_id: matchId,
      team_id: homeTeamId,
      player_id: player!.id,
      jersey_number: 9,
      source_url: "https://example.com/lineup",
    });
    await service.from("match_events").insert({
      match_id: matchId,
      minute: 10,
      player_id: player!.id,
      team_id: homeTeamId,
      type: "try",
    });
    await service
      .from("matches")
      .update({ away_score: 0, home_score: 5, status: "finished" })
      .eq("id", matchId);

    const result = await assembleMatchContentInput(matchId);

    expect(
      result.japanese_name_glossary?.filter(
        (entry) => entry.kind === "player" && entry.source === "Kippei Ishida",
      ),
    ).toEqual([
      {
        japanese: "石田 吉平",
        kind: "player",
        source: "Kippei Ishida",
      },
    ]);
  });

  it("derives playoff final phase from match external ids", async () => {
    const { matchId, service } = await insertMatchFixture();

    await service
      .from("matches")
      .update({
        away_score: 17,
        external_ids: { round_name: "Final", source: "wikipedia" },
        home_score: 28,
        status: "finished",
      })
      .eq("id", matchId);

    const result = await assembleMatchContentInput(matchId);

    expect(result.match_phase).toBe("playoff_final");
  });

  it("derives third-place playoff phase before final fallback", async () => {
    const { matchId, service } = await insertMatchFixture();

    await service
      .from("matches")
      .update({
        external_ids: { round_name: "3rd place match/Final", source: "live" },
      })
      .eq("id", matchId);

    const result = await assembleMatchContentInput(matchId);

    expect(result.match_phase).toBe("playoff_third_place");
  });

  it("keeps semifinal and numeric round phase derivation", async () => {
    const semifinal = await insertMatchFixture();

    await semifinal.service
      .from("matches")
      .update({
        external_ids: { round_name: "Semi-final", source: "live" },
      })
      .eq("id", semifinal.matchId);

    const semifinalResult = await assembleMatchContentInput(semifinal.matchId);

    expect(semifinalResult.match_phase).toBe("playoff_semifinal");

    const league = await insertMatchFixture();

    await league.service
      .from("matches")
      .update({
        external_ids: { source: "live", wikipedia_round: 2 },
      })
      .eq("id", league.matchId);

    const leagueResult = await assembleMatchContentInput(league.matchId);

    expect(leagueResult.match_phase).toBe("league");
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

  it("derives team_stats from parseable sourced facts for non-Top14 matches", async () => {
    const { matchId, service } = await insertMatchFixture();

    await service.from("match_sourced_facts").insert([
      {
        confidence: "high",
        content_type: "recap",
        fact: "Possession: Home 48% - Away 52%",
        match_id: matchId,
        model_version: "test-model",
        source_domain: "rugby-japan.jp",
        source_url: "https://rugby-japan.jp/example",
      },
      {
        confidence: "high",
        content_type: "recap",
        fact: "Tackle counts: Home 120 - Away 110",
        match_id: matchId,
        model_version: "test-model",
        source_domain: "rugby-japan.jp",
        source_url: "https://rugby-japan.jp/example",
      },
      {
        confidence: "high",
        content_type: "recap",
        fact: "Broadcast: available on example service",
        match_id: matchId,
        model_version: "test-model",
        source_domain: "example.com",
        source_url: "https://example.com/broadcast",
      },
    ]);

    const result = await assembleMatchContentInput(matchId, "ja", "recap");

    expect(result.team_stats).toMatchObject({
      away: {
        possession_pct: 52,
        tackles_made: 110,
      },
      home: {
        possession_pct: 48,
        tackles_made: 120,
      },
    });
    expect(result.sourced_facts.map((sourcedFact) => sourcedFact.fact)).toEqual(
      ["Broadcast: available on example service"],
    );
  });

  it("keeps Top14 match_team_stats ahead of sourced facts derivation", async () => {
    const { awayTeamId, competitionId, homeTeamId, matchId, service } =
      await insertMatchFixture();

    await service
      .from("competitions")
      .update({ family: "top-14" })
      .eq("id", competitionId);
    await service.from("match_team_stats").insert([
      {
        match_id: matchId,
        possession_pct: 61,
        source_url: "https://lnr.fr/example",
        team_id: homeTeamId,
        territory_pct: 58,
      },
      {
        match_id: matchId,
        possession_pct: 39,
        source_url: "https://lnr.fr/example",
        team_id: awayTeamId,
        territory_pct: 42,
      },
    ]);
    await service.from("match_sourced_facts").insert({
      confidence: "high",
      content_type: "recap",
      fact: "Possession: Home 48% - Away 52%",
      match_id: matchId,
      model_version: "test-model",
      source_domain: "rugby-japan.jp",
      source_url: "https://rugby-japan.jp/example",
    });

    const result = await assembleMatchContentInput(matchId, "ja", "recap");

    expect(result.team_stats).toMatchObject({
      away: {
        possession_pct: 39,
        territory_pct: 42,
      },
      home: {
        possession_pct: 61,
        territory_pct: 58,
      },
    });
    expect(result.sourced_facts.map((sourcedFact) => sourcedFact.fact)).toEqual(
      ["Possession: Home 48% - Away 52%"],
    );
  });
});
