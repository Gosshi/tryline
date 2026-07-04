import type { AssembledContentInput } from "@/lib/llm/types";

type ProjectedLineups = AssembledContentInput["projected_lineups"];

function hasConfirmedEntry(entries: ProjectedLineups["home"]) {
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
