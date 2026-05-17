import { load } from "cheerio";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_BATCH_SIZE = 25;

type MatchGapRow = {
  away_team_id: string;
  external_ids: Json;
  home_team_id: string;
  id: string;
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

function extractEventHtml(html: string, eventId: string | null): string {
  if (!eventId) {
    return html;
  }

  const $ = load(html);
  const eventBlock = $("[id]")
    .filter((_, element) => $(element).attr("id") === eventId)
    .first();

  return eventBlock.length ? $.html(eventBlock) : html;
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

  const { data: eventedRows, error: eventedError } = await client
    .from("match_events")
    .select("match_id");

  if (eventedError) {
    return NextResponse.json({ error: eventedError.message }, { status: 500 });
  }

  const matchIdsWithEvents = new Set(
    (eventedRows ?? []).map((row) => row.match_id),
  );

  let query = client
    .from("matches")
    .select("id, home_team_id, away_team_id, external_ids")
    .eq("status", "finished")
    .order("kickoff_at", { ascending: false });

  if (body.matchIds) {
    query = query.in("id", body.matchIds);
  } else {
    query = query.limit(CRON_BATCH_SIZE);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const gaps = ((data ?? []) as MatchGapRow[]).filter(
    (match) =>
      !matchIdsWithEvents.has(match.id) &&
      getWikipediaSource(match.external_ids) !== null,
  );
  let filled = 0;
  const errors: string[] = [];

  for (const match of gaps) {
    const source = getWikipediaSource(match.external_ids);

    if (!source) {
      continue;
    }

    try {
      const response = await fetchWithPolicy(source.url);
      const html = await response.text();
      const events = parseMatchEventsFromVeventHtml(
        extractEventHtml(html, source.eventId),
      );

      if (events.length > 0) {
        await upsertMatchEvents({
          awayTeamId: match.away_team_id,
          events,
          homeTeamId: match.home_team_id,
          matchId: match.id,
        });
        filled += 1;
      }
    } catch (error) {
      errors.push(`${match.id}: ${String(error)}`);
    }

    await sleep(1_500);
  }

  return NextResponse.json({ errors, filled, gaps: gaps.length });
}
