import type { MatchListItem } from "@/lib/db/queries/matches";
import type { StandingRow } from "@/lib/db/queries/standings";

function getMetadataTeamName(team: {
  name: string;
  nameJa?: string | null;
}): string {
  return team.nameJa?.trim() || team.name.trim();
}

export function getCompetitionMetadataTeams(
  matches: MatchListItem[],
  standings: StandingRow[],
): string[] {
  const standingTeams = standings
    .map((standing) => standing.teamName.trim())
    .filter((teamName) => teamName && teamName !== "-");
  const teamNames =
    standingTeams.length > 0
      ? standingTeams
      : matches
          .flatMap((match) => [
            getMetadataTeamName(match.homeTeam),
            getMetadataTeamName(match.awayTeam),
          ])
          .filter(Boolean);

  return [...new Set(teamNames)].sort((left, right) =>
    left.localeCompare(right, "ja"),
  );
}
