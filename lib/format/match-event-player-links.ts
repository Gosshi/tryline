import { playerNamesLikelyMatch } from "@/lib/stats/player-stats";

import type { MatchEventRow } from "@/lib/db/queries/match-events";
import type { MatchLineupPlayer } from "@/lib/db/queries/match-lineups";

export function buildMatchEventPlayerLinks(
  events: MatchEventRow[],
  players: MatchLineupPlayer[],
): Record<string, string> {
  return Object.fromEntries(
    events.flatMap((event) => {
      const candidates = players.filter(
        (player) =>
          player.teamId === event.teamId &&
          player.playerSlug !== null &&
          playerNamesLikelyMatch(player.playerName, event.playerName),
      );

      return candidates.length === 1
        ? [[event.id, candidates[0]!.playerSlug!]]
        : [];
    }),
  );
}
