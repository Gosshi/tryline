import {
  apiError,
  apiSuccess,
  PUBLIC_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import {
  getPoolStandingsForCompetition,
  getStandingsForCompetition,
} from "@/lib/db/queries/standings";
import { getCompetitionDisplayName } from "@/lib/format/competition";

import type { V1Standing, V1StandingsData } from "@/lib/api/v1/types";
import type { StandingRow } from "@/lib/db/queries/standings";

function mapStanding(standing: StandingRow): V1Standing {
  return {
    bonus_points_losing: standing.bonusPointsLosing,
    bonus_points_try: standing.bonusPointsTry,
    drawn: standing.drawn,
    lost: standing.lost,
    played: standing.played,
    points_against: standing.pointsAgainst,
    points_for: standing.pointsFor,
    position: standing.position,
    team_name: standing.teamName,
    team_short_code: standing.teamShortCode,
    total_points: standing.totalPoints,
    tries_for: standing.triesFor,
    won: standing.won,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const competition = await getCompetitionBySlug(slug);

  if (!competition) {
    return apiError("competition not found", 404, PUBLIC_CACHE_CONTROL);
  }

  const [standings, poolStandings] = await Promise.all([
    getStandingsForCompetition(slug),
    getPoolStandingsForCompetition(slug),
  ]);
  const hasPools = poolStandings.length > 0;
  const data: V1StandingsData = {
    competition: {
      name: getCompetitionDisplayName(competition),
      season: competition.season,
      slug: competition.slug,
    },
    pools: hasPools
      ? poolStandings.map((pool) => ({
          pool_name: pool.poolName,
          standings: pool.standings.map(mapStanding),
        }))
      : [],
    standings: hasPools ? [] : standings.map(mapStanding),
  };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
