import {
  apiError,
  apiSuccess,
  PUBLIC_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import {
  getBroadcastUrlsForMatches,
  getV1BroadcastsForMatches,
} from "@/lib/api/v1/server";
import { buildNewsItems } from "@/lib/api/v1/stories";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import {
  getMatchById,
  getNextMatchesForTeams,
  getRelatedPublishedRecapsForMatch,
  getSingleNationCompetitionIds,
  type RecentlyReviewedMatch,
  type UpcomingMatch,
} from "@/lib/db/queries/matches";
import { getStorySourcedFactsForMatches } from "@/lib/db/queries/sourced-facts";
import { getCompetitionDisplayName } from "@/lib/format/competition";
import {
  computeEventPointTotals,
  eventTotalsMatchFinalScore,
} from "@/lib/ingestion/event-integrity";

import type { V1MatchDetailData, V1NextReadMatch } from "@/lib/api/v1/types";

function mapNextReadMatch(
  match: RecentlyReviewedMatch | UpcomingMatch,
  hasRecap: boolean,
  suppressFlags: boolean,
): V1NextReadMatch {
  return {
    away_team: {
      flag_code: suppressFlags ? null : (match.awayTeam.flagCode ?? null),
      id: match.awayTeam.id ?? null,
      name: match.awayTeam.name,
      score: match.awayScore,
      short_code: match.awayTeam.shortCode,
      slug: match.awayTeam.slug,
    },
    competition_name: getCompetitionDisplayName(match.competition),
    has_recap: hasRecap,
    home_team: {
      flag_code: suppressFlags ? null : (match.homeTeam.flagCode ?? null),
      id: match.homeTeam.id ?? null,
      name: match.homeTeam.name,
      score: match.homeScore,
      short_code: match.homeTeam.shortCode,
      slug: match.homeTeam.slug,
    },
    id: match.id,
    kickoff_utc: match.kickoffAt,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const match = await getMatchById(id);

  if (!match) {
    return apiError("match not found", 404, PUBLIC_CACHE_CONTROL);
  }

  const [
    events,
    lineups,
    broadcastUrls,
    broadcasts,
    relatedRecaps,
    nextTeamMatches,
    sourcedFacts,
  ] = await Promise.all([
    getMatchEventsForMatch(id),
    getMatchLineupsForMatch(id),
    getBroadcastUrlsForMatches([id]),
    getV1BroadcastsForMatches([id]),
    getRelatedPublishedRecapsForMatch({
      competitionSlug: match.competition.slug,
      excludeMatchId: id,
      round: match.round,
    }),
    getNextMatchesForTeams({
      afterIso: match.kickoffAt,
      excludeMatchId: id,
      teamIds: [match.homeTeamId, match.awayTeamId],
    }),
    getStorySourcedFactsForMatches([id]),
  ]);
  const relatedRecapMatches = relatedRecaps.filter(
    (relatedMatch) => relatedMatch.id !== id,
  );
  const relatedRecapIds = new Set(
    relatedRecapMatches.map((relatedMatch) => relatedMatch.id),
  );
  const nextTeamMatchIds = new Set<string>();
  const uniqueNextTeamMatches = nextTeamMatches
    .map((entry) => entry.match)
    .filter((nextMatch) => {
      if (
        nextMatch.id === id ||
        relatedRecapIds.has(nextMatch.id) ||
        nextTeamMatchIds.has(nextMatch.id)
      ) {
        return false;
      }

      nextTeamMatchIds.add(nextMatch.id);

      return true;
    });
  const competitionIds = [
    match.competition.id,
    ...relatedRecapMatches.map((relatedMatch) => relatedMatch.competition.id),
    ...uniqueNextTeamMatches.map((nextMatch) => nextMatch.competition.id),
  ].filter(
    (competitionId): competitionId is string => competitionId !== undefined,
  );
  const singleNationCompetitionIds =
    await getSingleNationCompetitionIds(competitionIds);
  const suppressMatchFlags =
    match.competition.id !== undefined &&
    singleNationCompetitionIds.has(match.competition.id);
  const eventIntegrity =
    match.status !== "finished" ||
    match.homeScore === null ||
    match.awayScore === null ||
    events.length === 0
      ? "unavailable"
      : events.some(
            (event) =>
              event.teamId !== match.homeTeamId &&
              event.teamId !== match.awayTeamId,
          )
        ? "mismatch"
        : eventTotalsMatchFinalScore(
              computeEventPointTotals(events, {
                away: { id: match.awayTeamId, name: match.awayTeam.name },
                home: { id: match.homeTeamId, name: match.homeTeam.name },
              }),
              {
                away_score: match.awayScore,
                home_score: match.homeScore,
              },
            )
          ? "verified"
          : "mismatch";
  const data: V1MatchDetailData = {
    match: {
      away_team: {
        english_name: match.awayTeam.englishName,
        flag_code: suppressMatchFlags
          ? null
          : (match.awayTeam.flagCode ?? null),
        id: match.awayTeamId,
        name: match.awayTeam.name,
        score: match.awayScore,
        short_code: match.awayTeam.shortCode,
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
      event_integrity: eventIntegrity,
      events: (eventIntegrity === "mismatch" ? [] : events).map((event) => ({
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
        flag_code: suppressMatchFlags
          ? null
          : (match.homeTeam.flagCode ?? null),
        id: match.homeTeamId,
        name: match.homeTeam.name,
        score: match.homeScore,
        short_code: match.homeTeam.shortCode,
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
      next_team_matches: uniqueNextTeamMatches.map((nextMatch) =>
        mapNextReadMatch(
          nextMatch,
          false,
          nextMatch.competition.id !== undefined &&
            singleNationCompetitionIds.has(nextMatch.competition.id),
        ),
      ),
      pool_name: match.poolName,
      related_news: [
        ...buildNewsItems(match, sourcedFacts, "pre"),
        ...buildNewsItems(match, sourcedFacts, "post"),
      ],
      related_recaps: relatedRecapMatches.map((relatedMatch) =>
        mapNextReadMatch(
          relatedMatch,
          true,
          relatedMatch.competition.id !== undefined &&
            singleNationCompetitionIds.has(relatedMatch.competition.id),
        ),
      ),
      round: match.round,
      round_name: match.roundName,
      status: match.status,
      venue: match.venue,
    },
  };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
