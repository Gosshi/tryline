import type { AssembledContentInput } from "@/lib/llm/types";

export type StandingsFreshness = {
  home: { expected_played: number; played: number | null };
  away: { expected_played: number; played: number | null };
};

export function hasCurrentStandings(
  freshness: StandingsFreshness | undefined,
): boolean {
  return (
    !freshness ||
    (freshness.home.played !== null &&
      freshness.away.played !== null &&
      freshness.home.played === freshness.home.expected_played &&
      freshness.away.played === freshness.away.expected_played)
  );
}

type ProjectedLineups = AssembledContentInput["projected_lineups"];

export function hasConfirmedEntry(entries: ProjectedLineups["home"]) {
  return entries.some(
    (entry) => entry.jersey_number !== null || entry.is_starter !== null,
  );
}

export function hasConfirmedProjectedLineups(lineups: ProjectedLineups) {
  if (lineups.confirmed) {
    return lineups.confirmed.home || lineups.confirmed.away;
  }

  return hasConfirmedEntry(lineups.home) || hasConfirmedEntry(lineups.away);
}

export function sanitizeUnconfirmedProjectedLineups(
  assembled: AssembledContentInput,
): AssembledContentInput {
  const lineups = assembled.projected_lineups;
  const homeConfirmed = lineups.confirmed
    ? lineups.confirmed.home
    : hasConfirmedEntry(lineups.home);
  const awayConfirmed = lineups.confirmed
    ? lineups.confirmed.away
    : hasConfirmedEntry(lineups.away);

  return {
    ...assembled,
    projected_lineups: {
      ...lineups,
      away: awayConfirmed ? lineups.away : [],
      home: homeConfirmed ? lineups.home : [],
    },
  };
}

export function buildUsableContentInput(
  assembled: AssembledContentInput,
): AssembledContentInput {
  const sanitized = sanitizeUnconfirmedProjectedLineups(assembled);
  return hasCurrentStandings(assembled.standings_freshness)
    ? sanitized
    : { ...sanitized, competition_standings: [] };
}
