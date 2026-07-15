import {
  apiError,
  apiSuccess,
  PUBLIC_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import {
  getBroadcastUrlsForMatches,
  getV1BroadcastsForMatches,
} from "@/lib/api/v1/server";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import { getMatchById } from "@/lib/db/queries/matches";
import { getCompetitionDisplayName } from "@/lib/format/competition";

import type { V1MatchDetailData } from "@/lib/api/v1/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const match = await getMatchById(id);

  if (!match) {
    return apiError("match not found", 404, PUBLIC_CACHE_CONTROL);
  }

  const [events, lineups, broadcastUrls, broadcasts] = await Promise.all([
    getMatchEventsForMatch(id),
    getMatchLineupsForMatch(id),
    getBroadcastUrlsForMatches([id]),
    getV1BroadcastsForMatches([id]),
  ]);
  const data: V1MatchDetailData = {
    match: {
      away_team: {
        english_name: match.awayTeam.englishName,
        id: match.awayTeamId,
        name: match.awayTeam.name,
        score: match.awayScore,
        slug: match.awayTeam.slug,
      },
      broadcast_jp_url: broadcastUrls.get(id) ?? null,
      broadcasts: broadcasts.get(id) ?? [],
      competition: {
        family: match.competition.family,
        name: getCompetitionDisplayName(match.competition),
        season: match.competition.season,
        slug: match.competition.slug,
      },
      events: events.map((event) => ({
        id: event.id,
        is_penalty_try: event.isPenaltyTry,
        minute: event.minute,
        player_name: event.playerName,
        points: event.points,
        team_id: event.teamId,
        type: event.type,
      })),
      home_team: {
        english_name: match.homeTeam.englishName,
        id: match.homeTeamId,
        name: match.homeTeam.name,
        score: match.homeScore,
        slug: match.homeTeam.slug,
      },
      id: match.id,
      kickoff_utc: match.kickoffAt,
      lineups: lineups.map((player) => ({
        is_starter: player.isStarter,
        jersey_number: player.jerseyNumber,
        player_name: player.playerName,
        player_slug: player.playerSlug,
        position: player.position,
        team_id: player.teamId,
      })),
      pool_name: match.poolName,
      round: match.round,
      round_name: match.roundName,
      status: match.status,
      venue: match.venue,
    },
  };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
