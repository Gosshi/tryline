import {
  apiError,
  apiSuccess,
  PUBLIC_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import {
  getBroadcastUrlsForMatches,
  getV1BroadcastsForMatches,
} from "@/lib/api/v1/server";
import { getContentStatusForMatches } from "@/lib/db/queries/match-content";
import { getMatchesInRange } from "@/lib/db/queries/matches";
import { getCompetitionDisplayName } from "@/lib/format/competition";
import { getCurrentJstWeekRangeUtc } from "@/lib/format/week";

import type { V1CalendarData, V1CalendarMatch } from "@/lib/api/v1/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function parseDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const utcMs = Date.UTC(year!, month! - 1, day!);

  return new Date(utcMs).toISOString().slice(0, 10) === value ? utcMs : null;
}

function resolveRange(
  request: Request,
): { endUtcIso: string; startUtcIso: string } | { error: string } {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from === null && to === null) {
    return getCurrentJstWeekRangeUtc();
  }

  if (from === null || to === null) {
    return { error: "from and to must be provided together" };
  }

  const fromMs = parseDate(from);
  const toMs = parseDate(to);

  if (fromMs === null || toMs === null) {
    return { error: "from and to must be valid ISO 8601 dates" };
  }

  if (fromMs > toMs) {
    return { error: "from must be on or before to" };
  }

  if ((toMs - fromMs) / DAY_MS > 31) {
    return { error: "date range must not exceed 31 days" };
  }

  return {
    endUtcIso: new Date(toMs + DAY_MS - JST_OFFSET_MS).toISOString(),
    startUtcIso: new Date(fromMs - JST_OFFSET_MS).toISOString(),
  };
}

export async function GET(request: Request) {
  const range = resolveRange(request);

  if ("error" in range) {
    return apiError(range.error, 400, PUBLIC_CACHE_CONTROL);
  }

  const matches = await getMatchesInRange(range.startUtcIso, range.endUtcIso);
  const matchIds = matches.map((match) => match.id);
  const [contentStatuses, broadcastUrls, broadcasts] = await Promise.all([
    getContentStatusForMatches(matchIds),
    getBroadcastUrlsForMatches(matchIds),
    getV1BroadcastsForMatches(matchIds),
  ]);
  const responseMatches: V1CalendarMatch[] = matches.map((match) => {
    const contentStatus = contentStatuses[match.id];

    return {
      away_team: {
        id: match.awayTeam.id ?? null,
        name: match.awayTeam.name,
        score: match.awayScore,
        slug: match.awayTeam.slug,
      },
      broadcast_jp_url: broadcastUrls.get(match.id) ?? null,
      competition: {
        name: getCompetitionDisplayName(match.competition),
        season: match.competition.season,
        slug: match.competition.slug,
      },
      has_broadcasts: (broadcasts.get(match.id) ?? []).length > 0,
      has_preview: contentStatus?.hasPreview ?? false,
      has_recap: contentStatus?.hasRecap ?? false,
      home_team: {
        id: match.homeTeam.id ?? null,
        name: match.homeTeam.name,
        score: match.homeScore,
        slug: match.homeTeam.slug,
      },
      id: match.id,
      kickoff_utc: match.kickoffAt,
      status: match.status,
    };
  });

  const data: V1CalendarData = { matches: responseMatches };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
