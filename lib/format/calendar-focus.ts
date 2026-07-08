import { getMatchLevelScore } from "@/lib/format/match-level";

import type { CalendarMatch } from "@/lib/db/queries/matches";
import type { StandingPositionLookup } from "@/lib/db/queries/standings";

function isJapanMatch(match: CalendarMatch): boolean {
  return match.homeTeam.slug === "japan" || match.awayTeam.slug === "japan";
}

export function selectCalendarFocusMatchId(
  matches: CalendarMatch[],
  standingPositions: StandingPositionLookup,
): string | null {
  const japanMatch = matches.find(isJapanMatch);

  if (japanMatch) {
    return japanMatch.id;
  }

  let bestMatchId: string | null = null;
  let bestScore: number | null = null;

  for (const match of matches) {
    const score = getMatchLevelScore(match, standingPositions);

    if (score === null) {
      continue;
    }

    if (bestScore === null || score < bestScore) {
      bestScore = score;
      bestMatchId = match.id;
    }
  }

  return bestMatchId;
}
