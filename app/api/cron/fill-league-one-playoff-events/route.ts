import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchLeagueOneMatchDetail } from "@/lib/scrapers/league-one-match";
import { fetchLeagueOnePlayoffMatchRefs } from "@/lib/scrapers/wikipedia-league-one-playoffs";

import type { Json } from "@/lib/db/types";
import type { LeagueOneEvent } from "@/lib/scrapers/league-one-match";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

export const runtime = "nodejs";
export const maxDuration = 60;

type CompetitionRow = {
  id: string;
  season: string;
  slug: string;
};

type MatchRow = {
  away_team_id: string;
  external_ids: Json;
  home_team_id: string;
  id: string;
  match_events: Array<{ id: string }>;
  status: string;
};

type MatchExternalIds = {
  wikipedia_event_id?: unknown;
};

const bodySchema = z.object({
  season: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function parseOptionalBody(request: Request) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  return bodySchema.parse(JSON.parse(text));
}

function extractLeagueOneMatchId(externalIds: Json): number | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const value = (externalIds as MatchExternalIds).wikipedia_event_id;

  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^match_(\d+)$/);

  return match ? Number(match[1]) : null;
}

function mapLeagueOneEvent(event: LeagueOneEvent): ParsedMatchEvent {
  return {
    isPenaltyTry: event.event_type === "try" && event.player_name === "Penalty try",
    minute: event.minute,
    playerName: event.player_name,
    teamSide: event.team_side,
    type: event.event_type === "penalty" ? "penalty_goal" : event.event_type,
  };
}

function deriveSeasonFromSlug(slug: string): string | null {
  return slug.match(/(\d{4}-\d{2})$/)?.[1] ?? null;
}

async function loadCompetition(season: string | undefined) {
  const client = getSupabaseServerClient();

  if (season) {
    const { data, error } = await client
      .from("competitions")
      .select("id, season, slug")
      .eq("family", "league-one")
      .eq("season", season)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as CompetitionRow | null;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const { data, error } = await client
    .from("competitions")
    .select("id, season, slug")
    .eq("family", "league-one")
    .gte("end_date", cutoff.toISOString().slice(0, 10))
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as CompetitionRow | null;
}

async function loadMatches(competitionId: string): Promise<MatchRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        status,
        home_team_id,
        away_team_id,
        external_ids,
        match_events(id)
      `,
    )
    .eq("competition_id", competitionId)
    .eq("status", "finished");

  if (error) {
    throw error;
  }

  return (data ?? []) as MatchRow[];
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    throw error;
  }

  let body: z.infer<typeof bodySchema>;

  try {
    body = await parseOptionalBody(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_body", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let competition: CompetitionRow | null;

  try {
    competition = await loadCompetition(body.season);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  if (!competition) {
    return NextResponse.json(
      { error: "league_one_competition_not_found" },
      { status: 404 },
    );
  }

  const season = body.season ?? deriveSeasonFromSlug(competition.slug);

  if (!season) {
    return NextResponse.json(
      { error: "unable_to_derive_season", slug: competition.slug },
      { status: 500 },
    );
  }

  let refs: Awaited<ReturnType<typeof fetchLeagueOnePlayoffMatchRefs>>;
  let matches: MatchRow[];

  try {
    [refs, matches] = await Promise.all([
      fetchLeagueOnePlayoffMatchRefs(season),
      loadMatches(competition.id),
    ]);
  } catch (error) {
    return NextResponse.json({ error: String(error), season }, { status: 500 });
  }

  const matchesByLeagueOneId = new Map<number, MatchRow>();

  for (const match of matches) {
    const leagueOneMatchId = extractLeagueOneMatchId(match.external_ids);

    if (leagueOneMatchId !== null) {
      matchesByLeagueOneId.set(leagueOneMatchId, match);
    }
  }

  let eventsInserted = 0;
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ref of refs) {
    if (ref.homeScore === null || ref.awayScore === null) {
      skipped += 1;
      continue;
    }

    const match = matchesByLeagueOneId.get(ref.leagueOneMatchId);

    if (!match || match.status !== "finished" || match.match_events.length > 0) {
      skipped += 1;
      continue;
    }

    try {
      const detail = await fetchLeagueOneMatchDetail(ref.leagueOneMatchId);
      const events = detail.events.map(mapLeagueOneEvent);

      if (events.length === 0) {
        skipped += 1;
      } else {
        const result = await upsertMatchEvents({
          awayTeamId: match.away_team_id,
          events,
          homeTeamId: match.home_team_id,
          matchId: match.id,
        });

        processed += 1;
        eventsInserted += result.inserted;
      }
    } catch (error) {
      errors.push(`${ref.leagueOneMatchId}: ${String(error)}`);
    } finally {
      await sleep(1_500);
    }
  }

  return NextResponse.json({
    errors,
    eventsInserted,
    processed,
    season,
    skipped,
  });
}