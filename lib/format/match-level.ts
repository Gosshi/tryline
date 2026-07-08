export type StandingPositionLookup = Map<string, Map<string, number>>;

export type MatchLevelCandidate = {
  awayTeam: {
    id?: string | null;
    worldRanking?: number | null;
  };
  competition?: {
    id?: string | null;
  } | null;
  homeTeam: {
    id?: string | null;
    worldRanking?: number | null;
  };
};

export function getMatchLevelScore(
  match: MatchLevelCandidate,
  standingPositions: StandingPositionLookup,
): number | null {
  const homeRanking = match.homeTeam.worldRanking ?? null;
  const awayRanking = match.awayTeam.worldRanking ?? null;

  if (homeRanking !== null && awayRanking !== null) {
    return homeRanking + awayRanking;
  }

  const competitionId = match.competition?.id;
  const homeTeamId = match.homeTeam.id;
  const awayTeamId = match.awayTeam.id;

  if (!competitionId || !homeTeamId || !awayTeamId) {
    return null;
  }

  const competitionPositions = standingPositions.get(competitionId);
  const homePosition = competitionPositions?.get(homeTeamId) ?? null;
  const awayPosition = competitionPositions?.get(awayTeamId) ?? null;

  return homePosition !== null && awayPosition !== null
    ? homePosition + awayPosition
    : null;
}
