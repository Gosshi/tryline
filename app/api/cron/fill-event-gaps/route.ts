import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { extractEventHtml, findEventBlockByTeams } from "@/lib/ingestion/wikipedia-event-block";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_BATCH_SIZE = 10;
const CRON_CANDIDATE_LIMIT = 200;

type MatchGapRow = {
  away_team_id: string;
  away_team: { english_name: string | null; name: string } | null;
  external_ids: Json;
  home_team_id: string;
  home_team: { english_name: string | null; name: string } | null;
  id: string;
  kickoff_at: string | null;
};

const bodySchema = z.object({
  matchIds: z.array(z.string().uuid()).min(1).max(40).optional(),
});

type WikipediaExternalIds = {
  wikipedia?: unknown;
  wikipedia_event_id?: unknown;
  wikipedia_url?: unknown;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getWikipediaSource(externalIds: Json) {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const ids = externalIds as WikipediaExternalIds;
  const url =
    typeof ids.wikipedia_url === "string"
      ? ids.wikipedia_url
      : typeof ids.wikipedia === "string"
        ? ids.wikipedia
        : null;

  if (!url) {
    return null;
  }

  return {
    eventId:
      typeof ids.wikipedia_event_id === "string"
        ? ids.wikipedia_event_id
        : null,
    url,
  };
}

async function parseOptionalBody(request: Request) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  return bodySchema.parse(JSON.parse(text));
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

  const client = getSupabaseServerClient();

  let query = client
    .from("matches")
    .select("id, home_team_id, away_team_id, external_ids, kickoff_at, home_team:teams!matches_home_team_id_fkey(name, english_name), away_team:teams!matches_away_team_id_fkey(name, english_name)")
    .eq("status", "finished")
    .order("kickoff_at", { ascending: false });

  if (body.matchIds) {
    query = query.in("id", body.matchIds);
  } else {
    query = query.limit(CRON_CANDIDATE_LIMIT);
  }

  const { data: candidateRows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (candidateRows ?? []) as MatchGapRow[];
  const candidateIds = candidates.map((match) => match.id);
  let existingMatchIds = new Set<string>();

  if (candidateIds.length > 0) {
    const { data: eventRows, error: eventError } = await client
      .from("match_events")
      .select("match_id")
      .in("match_id", candidateIds);

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    existingMatchIds = new Set(
      ((eventRows ?? []) as Array<{ match_id: string }>).map(
        ({ match_id }) => match_id,
      ),
    );
  }

  const gaps = candidates
    .filter((match) => !existingMatchIds.has(match.id))
    .filter((match) => getWikipediaSource(match.external_ids) !== null)
    .slice(
      0,
      body.matchIds ? undefined : CRON_BATCH_SIZE,
    );
  let filled = 0;
  const errors: string[] = [];
  const skipped: Array<{ matchId: string; reason: string }> = [];
  const rejections: Array<{
    detail: string;
    matchId: string;
    reason: "fixture_conflict" | "score_mismatch" | "third_team";
  }> = [];

  for (const match of gaps) {
    const source = getWikipediaSource(match.external_ids);

    if (!source) {
      continue;
    }

    try {
      const response = await fetchWithPolicy(source.url);
      const html = await response.text();
      let eventHtml = extractEventHtml(html, source.eventId);
      if (eventHtml === null) {
        const homeTeamName = match.home_team?.english_name ?? match.home_team?.name;
        const awayTeamName = match.away_team?.english_name ?? match.away_team?.name;
        const kickoffDate = match.kickoff_at?.slice(0, 10);
        if (homeTeamName && awayTeamName && kickoffDate) {
          eventHtml = findEventBlockByTeams(
            html,
            homeTeamName,
            awayTeamName,
            kickoffDate,
          );
        }
      }

      if (eventHtml === null) {
        skipped.push({ matchId: match.id, reason: "no_unique_event_block" });
        await sleep(1_500);
        continue;
      }

      const events = parseMatchEventsFromVeventHtml(eventHtml);

      if (events.length > 0) {
        const result = await upsertMatchEvents({
          awayTeamId: match.away_team_id,
          events,
          homeTeamId: match.home_team_id,
          matchId: match.id,
        });
        if ((result.rejected ?? []).length > 0) {
          rejections.push(
            ...result.rejected.map((rejection) => ({
              ...rejection,
              matchId: match.id,
            })),
          );
        } else {
          filled += 1;
        }
      }
    } catch (error) {
      errors.push(`${match.id}: ${String(error)}`);
    }

    await sleep(1_500);
  }

  const responseBody = {
    errors,
    filled,
    gaps: gaps.length,
    ...(skipped.length > 0 ? { skipped } : {}),
    ...(rejections.length > 0 ? { rejections } : {}),
  };

  return NextResponse.json(responseBody, {
    status: rejections.length > 0 ? 500 : 200,
  });
}
