import type { MatchListItem } from "@/lib/db/queries/matches";

export type RoundGroupKey = {
  type: "round";
  round: number | null;
  roundName: string | null;
};
export type WeekGroupKey = {
  type: "week";
  weekIndex: number;
  startDate: string;
  endDate: string;
};
export type GroupKey = RoundGroupKey | WeekGroupKey;

export function getIsoWeek(isoDateStr: string): number {
  const date = new Date(isoDateStr);
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));

  return Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

export function groupMatchesByWeek(
  matches: MatchListItem[],
): Array<[WeekGroupKey, MatchListItem[]]> {
  const grouped = new Map<number, MatchListItem[]>();

  for (const match of matches) {
    const week = getIsoWeek(match.kickoffAt);
    grouped.set(week, [...(grouped.get(week) ?? []), match]);
  }

  return [...grouped.entries()]
    .sort(([leftWeek], [rightWeek]) => leftWeek - rightWeek)
    .map(([, weekMatches], index) => {
      const dates = weekMatches
        .map((match) => match.kickoffAt.slice(0, 10))
        .sort();

      return [
        {
          endDate: dates[dates.length - 1]!,
          startDate: dates[0]!,
          type: "week" as const,
          weekIndex: index + 1,
        },
        weekMatches,
      ];
    });
}

export function groupMatchesByRound(
  matches: MatchListItem[],
): Array<[GroupKey, MatchListItem[]]> {
  const hasAnyRoundGrouping = matches.some(
    (match) => match.round !== null || match.roundName !== null,
  );

  if (!hasAnyRoundGrouping && matches.length > 0) {
    return groupMatchesByWeek(matches);
  }

  const grouped = new Map<
    string,
    { key: RoundGroupKey; matches: MatchListItem[] }
  >();

  for (const match of matches) {
    const bucketKey =
      match.round !== null
        ? `round:${match.round}`
        : match.roundName
          ? `name:${match.roundName}`
          : "null";
    const existing = grouped.get(bucketKey);

    if (existing) {
      existing.matches.push(match);
    } else {
      grouped.set(bucketKey, {
        key: {
          round: match.round,
          roundName: match.roundName ?? null,
          type: "round",
        },
        matches: [match],
      });
    }
  }

  return [...grouped.values()]
    .sort(({ key: left }, { key: right }) => {
      if (left.round === null && right.round === null) {
        return 0;
      }

      if (left.round === null) {
        return 1;
      }

      if (right.round === null) {
        return -1;
      }

      return left.round - right.round;
    })
    .map(({ key, matches: groupedMatches }) => [key, groupedMatches]);
}
