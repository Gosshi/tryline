import type { MatchListItem } from "@/lib/db/queries/matches";
import type { StandingRow } from "@/lib/db/queries/standings";

export function isSeasonNotStarted(
  matches: MatchListItem[],
  standings: StandingRow[],
  poolStandings: Array<{ standings: StandingRow[] }>,
): boolean {
  const hasStartedMatch = matches.some(
    (match) => match.status === "finished" || match.status === "in_progress",
  );
  const standingRows = [
    ...standings,
    ...poolStandings.flatMap((pool) => pool.standings),
  ];

  return !hasStartedMatch || standingRows.every((row) => row.played === 0);
}
