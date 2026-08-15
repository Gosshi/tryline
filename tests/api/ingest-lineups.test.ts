import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
} from "@/tests/db/helpers";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

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

  it("inserts missing players and upserts match_lineups", async () => {
    const { matchId, homeTeamId, awayTeamId, service } =
      await insertMatchFixture();
    await service
      .from("matches")
      .update({
        external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/match" },
      })
      .eq("id", matchId);

    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response(`
        <h2><span id="Line-ups">Line-ups</span></h2>
        <table class="wikitable">
          <tr><td>1</td><td>Home New Player</td></tr>
          <tr><td>16</td><td>Home Bench Player</td></tr>
        </table>
        <table class="wikitable">
          <tr><td>1</td><td>Away New Player</td></tr>
        </table>
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
      home_count: 2,
      away_count: 1,
    });
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);

    const players = await service
      .from("players")
      .select("team_id, name, slug")
      .in("name", ["Home New Player", "Away New Player"]);
    expect(players.error).toBeNull();
    expect(players.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          team_id: homeTeamId,
          name: "Home New Player",
          slug: "home-new-player",
        }),
        expect.objectContaining({
          team_id: awayTeamId,
          name: "Away New Player",
          slug: "away-new-player",
        }),
      ]),
    );

    const lineups = await service
      .from("match_lineups")
      .select("team_id, jersey_number")
      .eq("match_id", matchId)
      .order("team_id", { ascending: true });

    expect(lineups.error).toBeNull();
    expect(lineups.data?.length).toBe(3);
  });

  it("falls back to season-page vevent adjacent lineup tables with a single fetch", async () => {
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
      home_count: 2,
      away_count: 1,
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
    expect(players.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Home Season Fullback" }),
        expect.objectContaining({ name: "Home Season Hooker" }),
        expect.objectContaining({ name: "Away Season Fullback" }),
      ]),
    );
  });
});
