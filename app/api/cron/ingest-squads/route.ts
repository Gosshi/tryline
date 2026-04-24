import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { scrapeSquads } from "@/lib/scrapers/wikipedia-squads";

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const { WIKIPEDIA_SQUAD_URL } = getServerEnv();
    const players = await scrapeSquads(WIKIPEDIA_SQUAD_URL);

    if (players.length === 0) {
      return NextResponse.json({ upserted: 0, skipped_teams: [], no_data: true });
    }

    const db = getSupabaseServerClient();
    const teamSlugs = [...new Set(players.map((player) => player.team_slug))];
    const { data: teams, error: teamsError } = await db
      .from("teams")
      .select("id, slug")
      .in("slug", teamSlugs);

    if (teamsError) {
      throw teamsError;
    }

    const teamIdBySlug = Object.fromEntries(teams.map((team) => [team.slug, team.id]));
    const skippedTeams = new Set<string>();
    let upserted = 0;

    for (const teamSlug of teamSlugs) {
      const teamId = teamIdBySlug[teamSlug];

      if (!teamId) {
        skippedTeams.add(teamSlug);
        continue;
      }

      const batch = players
        .filter((player) => player.team_slug === teamSlug)
        .map((player) => ({
          team_id: teamId,
          name: player.name,
          position: player.position,
          caps: player.caps,
          date_of_birth: player.date_of_birth,
          external_ids: {
            wikipedia_title: player.name,
          },
          updated_at: new Date().toISOString(),
        }));

      if (batch.length === 0) {
        continue;
      }

      const { error } = await db
        .from("players")
        .upsert(batch, { onConflict: "team_id,name" });

      if (error) {
        throw error;
      }

      upserted += batch.length;
    }

    return NextResponse.json({
      upserted,
      skipped_teams: [...skippedTeams],
      no_data: false,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Failed to ingest squads.", error);

    return NextResponse.json({ error: "Failed to ingest squads" }, { status: 500 });
  }
}
