import { load } from "cheerio";
import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type MatchGapRow = {
  away_team_id: string;
  external_ids: Json;
  home_team_id: string;
  id: string;
  match_events: Array<{ id: string }>;
};

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

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    throw error;
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        home_team_id,
        away_team_id,
        external_ids,
        match_events(id)
      `,
    )
    .eq("status", "finished")
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const gaps = ((data ?? []) as MatchGapRow[]).filter(
    (match) =>
      match.match_events.length === 0 &&
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
