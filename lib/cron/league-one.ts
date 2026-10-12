type CompetitionRelation =
  | { family: string | null }
  | { family: string | null }[]
  | null;

export function isLeagueOneMatch(competition: CompetitionRelation): boolean {
  const value = Array.isArray(competition) ? competition[0] : competition;
  return value?.family === "league-one";
}
