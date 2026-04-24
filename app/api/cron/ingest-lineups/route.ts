import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { scrapeMatchLineup } from "@/lib/scrapers/wikipedia-lineups";

import type { Json } from "@/lib/db/types";

type JsonObject = Record<string, Json>;

function asJsonObject(value: Json): JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as JsonObject;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");

    if (!matchId || !isUuid(matchId)) {
      return NextResponse.json({ error: "match_id is required" }, { status: 400 });
    }

    const db = getSupabaseServerClient();
    const { data: match, error: matchError } = await db
      .from("matches")
      .select("id, home_team_id, away_team_id, external_ids")
      .eq("id", matchId)
      .maybeSingle();

    if (matchError) {
      throw matchError;
    }

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

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

    const lineup = await scrapeMatchLineup(wikipediaUrl);

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

      const existingByName = new Map(existing.map((player) => [player.name, player.id]));
      const missingNames = uniqueNames.filter((name) => !existingByName.has(name));

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
        },
      ];
    });

    const { error: upsertError } = await db
      .from("match_lineups")
      .upsert([...homeRows, ...awayRows], { onConflict: "match_id,team_id,jersey_number" });

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

    return NextResponse.json({ error: "Failed to ingest lineups" }, { status: 500 });
  }
}
