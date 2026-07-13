import type {
  MatchTeamStats,
  SourcedFactInput,
  Top14TeamStats,
} from "@/lib/llm/types";

type Top14TeamStatsField = keyof Top14TeamStats;

type DeriveTeamStatsResult = {
  away: Top14TeamStats | null;
  consumedFactIndexes: number[];
  home: Top14TeamStats | null;
  teamStats: MatchTeamStats;
};

const STAT_FIELD_BY_NAME = new Map<string, Top14TeamStatsField>([
  ["carries", "carries"],
  ["lineout success", "lineout_success_pct"],
  ["metres gained", "metres_gained"],
  ["meters gained", "metres_gained"],
  ["penalties conceded", "penalties_conceded"],
  ["possession", "possession_pct"],
  ["red cards", "red_cards"],
  ["scrum success", "scrum_success_pct"],
  ["tackle counts", "tackles_made"],
  ["tackle count", "tackles_made"],
  ["tackles made", "tackles_made"],
  ["tackles missed", "tackles_missed"],
  ["territory", "territory_pct"],
  ["turnovers", "turnovers"],
  ["yellow cards", "yellow_cards"],
]);

const FACT_STAT_PATTERN =
  /^([^:]+):\s*(.+?)\s+(-?\d+(?:\.\d+)?)(?:\s*(%|m))?\s*[-–]\s*(.+?)\s+(-?\d+(?:\.\d+)?)(?:\s*(%|m))?\s*$/i;

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeStatName(value: string): string {
  return normalizeText(value);
}

function normalizeTeamNames(names: string[]): string[] {
  return Array.from(
    new Set(names.map(normalizeText).filter((name) => name.length >= 3)),
  );
}

function matchesTeam(candidate: string, teamNames: string[]): boolean {
  const normalizedCandidate = normalizeText(candidate);
  if (normalizedCandidate.length < 3) {
    return false;
  }

  return teamNames.some(
    (teamName) =>
      normalizedCandidate.includes(teamName) ||
      teamName.includes(normalizedCandidate),
  );
}

function resolveSide(
  candidate: string,
  homeTeamNames: string[],
  awayTeamNames: string[],
): "away" | "home" | null {
  const matchesHome = matchesTeam(candidate, homeTeamNames);
  const matchesAway = matchesTeam(candidate, awayTeamNames);

  if (matchesHome === matchesAway) {
    return null;
  }

  return matchesHome ? "home" : "away";
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isInteger(parsed) ? Math.trunc(parsed) : parsed;
}

function hasStats(stats: Top14TeamStats): boolean {
  return Object.keys(stats).length > 0;
}

export function deriveTeamStatsFromSourcedFacts(
  sourcedFacts: SourcedFactInput[],
  homeTeamNames: string[],
  awayTeamNames: string[],
): DeriveTeamStatsResult {
  const normalizedHomeTeamNames = normalizeTeamNames(homeTeamNames);
  const normalizedAwayTeamNames = normalizeTeamNames(awayTeamNames);
  const consumedFactIndexes: number[] = [];
  const home: Top14TeamStats = {};
  const away: Top14TeamStats = {};

  for (const [index, sourcedFact] of sourcedFacts.entries()) {
    const match = sourcedFact.fact.trim().match(FACT_STAT_PATTERN);
    if (!match) {
      continue;
    }

    const [
      ,
      rawStatName,
      firstTeamName,
      firstValue,
      ,
      secondTeamName,
      secondValue,
    ] = match;
    const field = STAT_FIELD_BY_NAME.get(normalizeStatName(rawStatName ?? ""));
    if (
      !field ||
      !firstTeamName ||
      !firstValue ||
      !secondTeamName ||
      !secondValue
    ) {
      continue;
    }

    const firstSide = resolveSide(
      firstTeamName,
      normalizedHomeTeamNames,
      normalizedAwayTeamNames,
    );
    const secondSide = resolveSide(
      secondTeamName,
      normalizedHomeTeamNames,
      normalizedAwayTeamNames,
    );

    if (!firstSide || !secondSide || firstSide === secondSide) {
      continue;
    }

    const firstStats = firstSide === "home" ? home : away;
    const secondStats = secondSide === "home" ? home : away;
    firstStats[field] = toNumber(firstValue);
    secondStats[field] = toNumber(secondValue);
    consumedFactIndexes.push(index);
  }

  const resolvedHome = hasStats(home) ? home : null;
  const resolvedAway = hasStats(away) ? away : null;

  return {
    away: resolvedAway,
    consumedFactIndexes,
    home: resolvedHome,
    teamStats:
      resolvedHome || resolvedAway
        ? { away: resolvedAway, home: resolvedHome }
        : null,
  };
}
