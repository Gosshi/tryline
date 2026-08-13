import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { fetchJrfuMatchLineup } from "@/lib/scrapers/jrfu-lineups";
import { parseMatchLineupFromHtml } from "@/lib/scrapers/wikipedia-lineups";

import type { Json } from "@/lib/db/types";

type JsonObject = Record<string, Json>;

type LineupPlayer = {
  is_starter?: boolean;
  jersey_number: number;
  name: string;
};

type ParsedLineup = {
  announced_at: string;
  away_players: LineupPlayer[];
  home_players: LineupPlayer[];
  source_url: string;
};

function asJsonObject(value: Json): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as JsonObject;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeJrfuTeamName(value: string) {
  return value.replace(/\s+/g, "").replace(/代表$/u, "");
}

function matchesJrfuOpponentName(params: {
  officialName: string;
  teamName: string;
  teamNameJa: string | null;
}) {
  const officialName = normalizeJrfuTeamName(params.officialName);

  return [params.teamName, params.teamNameJa]
    .filter((name): name is string => Boolean(name))
    .some((name) => normalizeJrfuTeamName(name) === officialName);
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");

    if (!matchId || !isUuid(matchId)) {
      return NextResponse.json(
        { error: "match_id is required" },
        { status: 400 },
      );
    }

    const db = getSupabaseServerClient();
    const { data: match, error: matchError } = await db
      .from("matches")
      .select(
        `
          id,
          home_team_id,
          away_team_id,
          kickoff_at,
          external_ids,
          home_team:teams!matches_home_team_id_fkey(name, name_ja, slug),
          away_team:teams!matches_away_team_id_fkey(name, name_ja, slug)
        `,
      )
      .eq("id", matchId)
      .maybeSingle();

    if (matchError) {
      throw matchError;
    }

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const japanIsHome = match.home_team?.slug === "japan";
    const japanIsAway = match.away_team?.slug === "japan";
    const isJapanMatch = japanIsHome || japanIsAway;
    let lineup: ParsedLineup | null;
    let usesJrfuLineup = false;

    if (isJapanMatch) {
      const jrfuLineup = await fetchJrfuMatchLineup(match.kickoff_at);

      if (!jrfuLineup) {
        return NextResponse.json({ announced: false });
      }

      const opponentTeam = japanIsHome ? match.away_team : match.home_team;

      if (
        !opponentTeam ||
        !matchesJrfuOpponentName({
          officialName: jrfuLineup.opponent_name,
          teamName: opponentTeam.name,
          teamNameJa: opponentTeam.name_ja,
        })
      ) {
        console.warn(
          `[ingest-lineups] Skipping JRFU lineup because opponent could not be resolved: ${jrfuLineup.opponent_name}`,
        );
        return NextResponse.json({ announced: false });
      }

      lineup = {
        announced_at: jrfuLineup.announced_at,
        away_players: japanIsAway
          ? jrfuLineup.japan_players
          : jrfuLineup.opponent_players,
        home_players: japanIsHome
          ? jrfuLineup.japan_players
          : jrfuLineup.opponent_players,
        source_url: jrfuLineup.source_url,
      };
      usesJrfuLineup = true;
    } else {
      const externalIds = asJsonObject(match.external_ids);
      const wikipediaUrl =
        typeof externalIds.wikipedia_url === "string"
          ? externalIds.wikipedia_url
          : null;

      if (!wikipediaUrl) {
        return NextResponse.json(
          { error: "matches.external_ids.wikipedia_url is not set" },
          { status: 400 },
        );
      }

      const response = await fetchWithPolicy(wikipediaUrl);
      const html = await response.text();
      lineup = parseMatchLineupFromHtml({
        awayTeamName: match.away_team?.name ?? null,
        homeTeamName: match.home_team?.name ?? null,
        html,
        kickoffAt: match.kickoff_at,
        sourceUrl: wikipediaUrl,
      });
    }

    if (!lineup) {
      return NextResponse.json({ announced: false });
    }

    async function ensurePlayerIds(
      teamId: string,
      names: string[],
    ): Promise<Map<string, string>> {
      const uniqueNames = [...new Set(names)];
      const { data: existing, error: existingError } = await db
        .from("players")
        .select("id, name")
        .eq("team_id", teamId)
        .in("name", uniqueNames);

      if (existingError) {
        throw existingError;
      }

      const existingByName = new Map(
        existing.map((player) => [player.name, player.id]),
      );
      const missingNames = uniqueNames.filter(
        (name) => !existingByName.has(name),
      );

      if (missingNames.length > 0) {
        const { error: insertError } = await db.from("players").insert(
          missingNames.map((name) => ({
            team_id: teamId,
            name,
            external_ids: { wikipedia_title: name },
          })),
        );

        if (insertError) {
          throw insertError;
        }

        const { data: inserted, error: insertedError } = await db
          .from("players")
          .select("id, name")
          .eq("team_id", teamId)
          .in("name", missingNames);

        if (insertedError) {
          throw insertedError;
        }

        inserted.forEach((player) => {
          existingByName.set(player.name, player.id);
        });
      }

      return existingByName;
    }

    const homeNames = lineup.home_players.map((player) => player.name);
    const awayNames = lineup.away_players.map((player) => player.name);
    const homePlayerIds = await ensurePlayerIds(match.home_team_id, homeNames);
    const awayPlayerIds = await ensurePlayerIds(match.away_team_id, awayNames);

    const homeRows = lineup.home_players.flatMap((player) => {
      const playerId = homePlayerIds.get(player.name);

      if (!playerId) {
        return [];
      }

      return [
        {
          match_id: match.id,
          team_id: match.home_team_id,
          player_id: playerId,
          jersey_number: player.jersey_number,
          announced_at: lineup.announced_at,
          source_url: lineup.source_url,
          ...(usesJrfuLineup ? { is_starter: player.is_starter } : {}),
        },
      ];
    });

    const awayRows = lineup.away_players.flatMap((player) => {
      const playerId = awayPlayerIds.get(player.name);

      if (!playerId) {
        return [];
      }

      return [
        {
          match_id: match.id,
          team_id: match.away_team_id,
          player_id: playerId,
          jersey_number: player.jersey_number,
          announced_at: lineup.announced_at,
          source_url: lineup.source_url,
          ...(usesJrfuLineup ? { is_starter: player.is_starter } : {}),
        },
      ];
    });

    const { error: upsertError } = await db
      .from("match_lineups")
      .upsert([...homeRows, ...awayRows], {
        onConflict: "match_id,team_id,jersey_number",
      });

    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json({
      announced: true,
      home_count: homeRows.length,
      away_count: awayRows.length,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Failed to ingest lineups.", error);

    return NextResponse.json(
      { error: "Failed to ingest lineups" },
      { status: 500 },
    );
  }
}
