import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
} from "@/tests/db/helpers";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

function lineupRows(team: string, count: number) {
  return Array.from(
    { length: count },
    (_, index) =>
      `<tr><td>${index + 1}</td><td>${team} Player ${index + 1}</td></tr>`,
  ).join("\n");
}

function directLineupsHtml(params: { awayCount: number; homeCount: number }) {
  return `
    <h2><span id="Line-ups">Line-ups</span></h2>
    <table class="wikitable">${lineupRows("Home", params.homeCount)}</table>
    <table class="wikitable">${lineupRows("Away", params.awayCount)}</table>
  `;
}

describe("/api/cron/ingest-lineups", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

  it("returns 401 without bearer token", async () => {
    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        "http://localhost/api/cron/ingest-lineups?match_id=00000000-0000-4000-8000-000000000000",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(401);
  });

  it("returns announced false when lineup is not published", async () => {
    const { matchId, service } = await insertMatchFixture();
    await service
      .from("matches")
      .update({
        external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/match" },
      })
      .eq("id", matchId);
    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response("<h2>No lineups</h2>"),
    );

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-lineups?match_id=${matchId}`,
        {
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ announced: false });
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);
  });

  it("inserts missing players and replaces complete match_lineups", async () => {
    const { matchId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();
    await service
      .from("matches")
      .update({
        external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/match" },
      })
      .eq("id", matchId);

    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response(directLineupsHtml({ awayCount: 15, homeCount: 15 })),
    );

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-lineups?match_id=${matchId}`,
        {
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      announced: true,
      home_count: 15,
      away_count: 15,
      skipped_teams: [],
    });
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);

    const players = await service
      .from("players")
      .select("team_id, name, slug")
      .in("name", ["Home Player 1", "Away Player 1"]);
    expect(players.error).toBeNull();
    expect(players.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          team_id: homeTeamId,
          name: "Home Player 1",
          slug: "home-player-1",
        }),
        expect.objectContaining({
          team_id: awayTeamId,
          name: "Away Player 1",
          slug: "away-player-1",
        }),
      ]),
    );

    const lineups = await service
      .from("match_lineups")
      .select("team_id, jersey_number")
      .eq("match_id", matchId)
      .order("team_id", { ascending: true });

    expect(lineups.error).toBeNull();
    expect(lineups.data?.length).toBe(30);
  });

  it("reports incomplete season-page lineups without writing them", async () => {
    const { matchId, service } = await insertMatchFixture();
    await service
      .from("matches")
      .update({
        external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/season" },
      })
      .eq("id", matchId);
    const { data: match } = await service
      .from("matches")
      .select(
        "home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
      )
      .eq("id", matchId)
      .single();
    const homeTeamName = match?.home_team?.name ?? "Home";
    const awayTeamName = match?.away_team?.name ?? "Away";

    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response(`
        <div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
        <section data-mw-section-id="5" aria-labelledby="Round_1">
          <div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
          <div class="vevent summary" id="Target_match">
            <table><tbody><tr><td>4 July 2026<br />17:40 JST</td></tr></tbody></table>
            <table><tbody><tr>
              <td class="vcard"><span class="fn org"><a>${homeTeamName}</a></span></td>
              <td>v</td>
              <td class="vcard"><span class="fn org"><a>${awayTeamName}</a></span></td>
            </tr></tbody></table>
          </div>
          <table>
            <tr><td>FB</td><td>15</td><td>Home Season Fullback</td></tr>
            <tr><td>R</td><td>16</td><td>Home Season Hooker</td></tr>
            <tr><td>FB</td><td>15</td><td>Away Season Fullback</td></tr>
          </table>
        </section>
      `),
    );

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-lineups?match_id=${matchId}`,
        {
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      announced: true,
      home_count: 0,
      away_count: 0,
      skipped_teams: ["home", "away"],
    });
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);

    const players = await service
      .from("players")
      .select("name")
      .in("name", [
        "Home Season Fullback",
        "Home Season Hooker",
        "Away Season Fullback",
      ]);

    expect(players.error).toBeNull();
    expect(players.data).toEqual([]);
  });

  it("keeps existing lineups when both parsed teams are incomplete", async () => {
    const { matchId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();
    await service
      .from("matches")
      .update({
        external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/match" },
      })
      .eq("id", matchId);
    const { data: stalePlayers, error: stalePlayersError } = await service
      .from("players")
      .insert([
        {
          name: "Home Stale Player",
          slug: "home-stale-player",
          team_id: homeTeamId,
        },
        {
          name: "Away Stale Player",
          slug: "away-stale-player",
          team_id: awayTeamId,
        },
      ])
      .select("id, team_id");

    expect(stalePlayersError).toBeNull();
    await service.from("match_lineups").insert(
      stalePlayers!.map((player) => ({
        jersey_number: 23,
        match_id: matchId,
        player_id: player.id,
        source_url: "https://en.wikipedia.org/wiki/previous-lineup",
        team_id: player.team_id,
      })),
    );
    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response(directLineupsHtml({ awayCount: 1, homeCount: 1 })),
    );

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-lineups?match_id=${matchId}`,
        {
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      announced: true,
      home_count: 0,
      away_count: 0,
      skipped_teams: ["home", "away"],
    });
    const { data: lineups } = await service
      .from("match_lineups")
      .select("team_id, jersey_number")
      .eq("match_id", matchId)
      .order("team_id", { ascending: true });
    expect(lineups).toEqual(
      expect.arrayContaining([
        { team_id: homeTeamId, jersey_number: 23 },
        { team_id: awayTeamId, jersey_number: 23 },
      ]),
    );

    const { data: partialHomePlayers } = await service
      .from("players")
      .select("name")
      .eq("name", "Home Player 1")
      .eq("team_id", homeTeamId);
    const { data: partialAwayPlayers } = await service
      .from("players")
      .select("name")
      .eq("name", "Away Player 1")
      .eq("team_id", awayTeamId);
    expect(partialHomePlayers).toEqual([]);
    expect(partialAwayPlayers).toEqual([]);
  });

  it("replaces only complete teams and removes their stale jersey numbers", async () => {
    const { matchId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();
    await service
      .from("matches")
      .update({
        external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/match" },
      })
      .eq("id", matchId);
    const { data: stalePlayers, error: stalePlayersError } = await service
      .from("players")
      .insert([
        {
          name: "Home Stale Reserve",
          slug: "home-stale-reserve",
          team_id: homeTeamId,
        },
        {
          name: "Away Stale Reserve",
          slug: "away-stale-reserve",
          team_id: awayTeamId,
        },
      ])
      .select("id, team_id");

    expect(stalePlayersError).toBeNull();
    await service.from("match_lineups").insert(
      stalePlayers!.map((player) => ({
        jersey_number: 23,
        match_id: matchId,
        player_id: player.id,
        source_url: "https://en.wikipedia.org/wiki/previous-lineup",
        team_id: player.team_id,
      })),
    );
    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response(directLineupsHtml({ awayCount: 1, homeCount: 15 })),
    );

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-lineups?match_id=${matchId}`,
        {
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      announced: true,
      home_count: 15,
      away_count: 0,
      skipped_teams: ["away"],
    });
    const { data: lineups } = await service
      .from("match_lineups")
      .select("team_id, jersey_number")
      .eq("match_id", matchId);
    expect(lineups).toHaveLength(16);
    expect(lineups).toEqual(
      expect.arrayContaining([
        { team_id: awayTeamId, jersey_number: 23 },
        { team_id: homeTeamId, jersey_number: 1 },
        { team_id: homeTeamId, jersey_number: 15 },
      ]),
    );
    expect(lineups).not.toEqual(
      expect.arrayContaining([{ team_id: homeTeamId, jersey_number: 23 }]),
    );

    const { data: partialAwayPlayers } = await service
      .from("players")
      .select("name")
      .eq("name", "Away Player 1")
      .eq("team_id", awayTeamId);
    expect(partialAwayPlayers).toEqual([]);
  });
});
