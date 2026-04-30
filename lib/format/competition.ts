export function formatCompetitionTitle(name: string, season: string): string {
  return name.includes(season) ? name : `${name} ${season}`;
}
