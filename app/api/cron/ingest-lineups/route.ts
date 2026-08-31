import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { resolveAvailablePlayerSlugs } from "@/lib/db/player-slug";
import { getSupabaseServerClient } from "@/lib/db/server";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseMatchLineupFromHtml } from "@/lib/scrapers/wikipedia-lineups";

import type { Json } from "@/lib/db/types";

type JsonObject = Record<string, Json>;

const REQUIRED_STARTER_COUNT = 15;

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

function hasCompleteStarterLineup(
  players: Array<{ jersey_number: number }>,
): boolean {
  const jerseyNumbers = new Set(
    players
      .map((player) => player.jersey_number)
      .filter((jerseyNumber) => jerseyNumber <= REQUIRED_STARTER_COUNT),
  );

  return (
    jerseyNumbers.size === REQUIRED_STARTER_COUNT &&
    [...jerseyNumbers].every(
      (jerseyNumber) =>
        jerseyNumber >= 1 && jerseyNumber <= REQUIRED_STARTER_COUNT,
    )
  );
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
          home_team:teams!matches_home_team_id_fkey(name),
          away_team:teams!matches_away_team_id_fkey(name)
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
    const lineup = parseMatchLineupFromHtml({
      awayTeamName: match.away_team?.name ?? null,
      homeTeamName: match.home_team?.name ?? null,
      html,
      kickoffAt: match.kickoff_at,
      sourceUrl: wikipediaUrl,
    });

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
        const slugs = await resolveAvailablePlayerSlugs(
          missingNames,
          async (candidates) => {
            const { data: matchingCandidates, error: matchingCandidatesError } =
              await db.from("players").select("slug").in("slug", candidates);

            if (matchingCandidatesError) {
              throw matchingCandidatesError;
            }

            if (matchingCandidates.length === 0) {
              return [];
            }

            const slugFilters = matchingCandidates
              .flatMap(({ slug }) => [
                `slug.eq.${slug}`,
                `slug.like.${slug}-%`,
              ])
              .join(",");
            const { data: occupiedSlugs, error: occupiedSlugsError } = await db
              .from("players")
              .select("slug")
              .or(slugFilters);

            if (occupiedSlugsError) {
              throw occupiedSlugsError;
            }

            return occupiedSlugs.map(({ slug }) => slug);
          },
        );
        const { error: insertError } = await db.from("players").insert(
          missingNames.map((name, index) => ({
            team_id: teamId,
            name,
            slug: slugs[index],
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

    const homeLineupIsComplete = hasCompleteStarterLineup(lineup.home_players);
    const awayLineupIsComplete = hasCompleteStarterLineup(lineup.away_players);
    const homeNames = homeLineupIsComplete
      ? lineup.home_players.map((player) => player.name)
      : [];
    const awayNames = awayLineupIsComplete
      ? lineup.away_players.map((player) => player.name)
      : [];
    const homePlayerIds = homeLineupIsComplete
      ? await ensurePlayerIds(match.home_team_id, homeNames)
      : new Map<string, string>();
    const awayPlayerIds = awayLineupIsComplete
      ? await ensurePlayerIds(match.away_team_id, awayNames)
      : new Map<string, string>();

    const homeRows = (homeLineupIsComplete ? lineup.home_players : []).flatMap(
      (player) => {
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
      },
    );

    const awayRows = (awayLineupIsComplete ? lineup.away_players : []).flatMap(
      (player) => {
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
      },
    );

    const homeLineupCanReplace =
      homeLineupIsComplete && homeRows.length === lineup.home_players.length;
    const awayLineupCanReplace =
      awayLineupIsComplete && awayRows.length === lineup.away_players.length;
    const skippedTeams = [
      ...(homeLineupCanReplace ? [] : ["home"]),
      ...(awayLineupCanReplace ? [] : ["away"]),
    ];

    if (skippedTeams.length > 0) {
      console.info("[ingest-lineups] skipped incomplete team lineup", {
        matchId,
        skippedTeams,
      });
    }

    const rows = [
      ...(homeLineupCanReplace ? homeRows : []),
      ...(awayLineupCanReplace ? awayRows : []),
    ];
    if (rows.length > 0) {
      const { error: upsertError } = await db
        .from("match_lineups")
        .upsert(rows, {
          onConflict: "match_id,team_id,jersey_number",
        });

      if (upsertError) {
        throw upsertError;
      }

      for (const { teamId, teamRows } of [
        ...(homeLineupCanReplace && homeRows.length > 0
          ? [{ teamId: match.home_team_id, teamRows: homeRows }]
          : []),
        ...(awayLineupCanReplace && awayRows.length > 0
          ? [{ teamId: match.away_team_id, teamRows: awayRows }]
          : []),
      ]) {
        const jerseyNumbers = teamRows
          .map((row) => row.jersey_number)
          .join(",");
        const { error: deleteError } = await db
          .from("match_lineups")
          .delete()
          .eq("match_id", match.id)
          .eq("team_id", teamId)
          .not("jersey_number", "in", `(${jerseyNumbers})`);

        if (deleteError) {
          throw deleteError;
        }
      }
    }

    return NextResponse.json({
      announced: true,
      home_count: homeLineupCanReplace ? homeRows.length : 0,
      away_count: awayLineupCanReplace ? awayRows.length : 0,
      skipped_teams: skippedTeams,
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
