import {
  apiError,
  apiSuccess,
  PUBLIC_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import {
  getBroadcastUrlsForMatches,
  getV1BroadcastsForMatches,
} from "@/lib/api/v1/server";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { getContentStatusForMatches } from "@/lib/db/queries/match-content";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";
import { getCompetitionDisplayName } from "@/lib/format/competition";

import type {
  V1CalendarMatch,
  V1CompetitionMatchesData,
} from "@/lib/api/v1/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const competition = await getCompetitionBySlug(slug);

  if (!competition) {
    return apiError("competition not found", 404, PUBLIC_CACHE_CONTROL);
  }

  const matches = await listMatchesForCompetition(slug);
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
        flag_code: match.awayTeam.flagCode ?? null,
        id: match.awayTeam.id ?? null,
        name: match.awayTeam.name,
        score: match.awayScore,
        short_code: match.awayTeam.shortCode,
        slug: match.awayTeam.slug,
      },
      broadcast_jp_url: broadcastUrls.get(match.id) ?? null,
      competition: {
        name: getCompetitionDisplayName(competition),
        season: competition.season,
        slug: competition.slug,
      },
      has_broadcasts: (broadcasts.get(match.id) ?? []).length > 0,
      has_preview: contentStatus?.hasPreview ?? false,
      has_recap: contentStatus?.hasRecap ?? false,
      home_team: {
        flag_code: match.homeTeam.flagCode ?? null,
        id: match.homeTeam.id ?? null,
        name: match.homeTeam.name,
        score: match.homeScore,
        short_code: match.homeTeam.shortCode,
        slug: match.homeTeam.slug,
      },
      id: match.id,
      kickoff_utc: match.kickoffAt,
      status: match.status,
    };
  });
  const data: V1CompetitionMatchesData = { matches: responseMatches };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
