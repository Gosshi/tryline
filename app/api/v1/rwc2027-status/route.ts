import { apiSuccess, PUBLIC_CACHE_CONTROL } from "@/lib/api/v1/response";
import { getCompetitionStartDateByFamilyAndSeason } from "@/lib/db/queries/competitions";
import { getTeamWorldRankingBySlug } from "@/lib/db/queries/teams";

import type { V1Rwc2027StatusData } from "@/lib/api/v1/types";

const JAPAN_TEAM_SLUG = "japan";
const RWC_FAMILY = "rwc";
const RWC_2027_SEASON = "2027";

export async function GET() {
  const [kickoffDate, japan] = await Promise.all([
    getCompetitionStartDateByFamilyAndSeason(RWC_FAMILY, RWC_2027_SEASON),
    getTeamWorldRankingBySlug(JAPAN_TEAM_SLUG),
  ]);
  const data: V1Rwc2027StatusData = {
    japan_ranking: japan?.worldRanking ?? null,
    japan_ranking_updated_at: japan?.worldRankingUpdatedAt ?? null,
    kickoff_date: kickoffDate,
  };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
