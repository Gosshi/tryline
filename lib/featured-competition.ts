import { getNextMatchForTeamSlug } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatKickoffJstDate } from "@/lib/format/kickoff";

export type FeaturedCompetition = {
  description: string;
  family: string;
  headline: string;
  season: string;
};

const FALLBACK_FEATURED_COMPETITION: FeaturedCompetition = {
  description:
    "7月・11月の代表戦を、日程・順位・結果・日本語レビューまでひとつのページで。",
  family: "nations-championship",
  headline: "ネーションズチャンピオンシップ 2026 を追う",
  season: "2026",
};

export async function getFeaturedCompetition(
  now: Date = new Date(),
): Promise<FeaturedCompetition> {
  const nextJapanMatch = await getNextMatchForTeamSlug(
    "japan",
    now.toISOString(),
  );

  if (!nextJapanMatch) {
    return FALLBACK_FEATURED_COMPETITION;
  }

  const competitionTitle = formatCompetitionTitle(
    nextJapanMatch.competition,
    nextJapanMatch.competition.season,
  );

  return {
    description: `次戦は${nextJapanMatch.homeTeam.name} 対 ${nextJapanMatch.awayTeam.name}（${formatKickoffJstDate(nextJapanMatch.kickoffAt)}）。日程・結果・日本語レビューまでひとつのページで追えます。`,
    family: nextJapanMatch.competition.family,
    headline: `${competitionTitle}を追う`,
    season: nextJapanMatch.competition.season,
  };
}
