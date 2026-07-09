import { pointsForMatchEvent } from "@/lib/format/match-event-points";

export type ActualPlayerStats = {
  conversions: number;
  penaltyGoals: number;
  totalPoints: number;
  tries: number;
};

export type PlayerStatsEvent = {
  is_penalty_try?: boolean;
  isPenaltyTry?: boolean;
  player_name?: string | null;
  type: string;
};

export type PlayerStatsEntry = {
  playerName: string;
  stats: ActualPlayerStats;
};

export function createEmptyPlayerStats(): ActualPlayerStats {
  return {
    conversions: 0,
    penaltyGoals: 0,
    totalPoints: 0,
    tries: 0,
  };
}

export function normalizePlayerNameForStatMatch(name: string): string {
  return name
    .replace(/[・.．'\s-]+/g, "")
    .trim()
    .toLocaleLowerCase();
}

export function playerNamesLikelyMatch(claimedName: string, eventName: string) {
  const claimed = normalizePlayerNameForStatMatch(claimedName);
  const actual = normalizePlayerNameForStatMatch(eventName);

  if (!claimed || !actual) {
    return false;
  }

  return (
    claimed === actual || actual.endsWith(claimed) || claimed.endsWith(actual)
  );
}

export function buildPlayerStatsFromEvents(
  events: PlayerStatsEvent[],
): Map<string, PlayerStatsEntry> {
  const statsByPlayer = new Map<string, PlayerStatsEntry>();

  for (const event of events) {
    if (!event.player_name) {
      continue;
    }

    const key = normalizePlayerNameForStatMatch(event.player_name);
    if (!key) {
      continue;
    }

    const current = statsByPlayer.get(key) ?? {
      playerName: event.player_name,
      stats: createEmptyPlayerStats(),
    };

    if (event.type === "try") current.stats.tries += 1;
    if (event.type === "conversion") current.stats.conversions += 1;
    if (event.type === "penalty_goal" || event.type === "penalty") {
      current.stats.penaltyGoals += 1;
    }
    current.stats.totalPoints += pointsForMatchEvent(event);
    statsByPlayer.set(key, current);
  }

  return statsByPlayer;
}

export function findActualPlayerStats(
  playerName: string,
  statsByPlayer: Map<string, PlayerStatsEntry>,
): ActualPlayerStats | null {
  for (const actual of statsByPlayer.values()) {
    if (playerNamesLikelyMatch(playerName, actual.playerName)) {
      return actual.stats;
    }
  }

  return null;
}
