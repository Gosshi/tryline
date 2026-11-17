import { formatPoolName } from "@/lib/format/competition";
import { getKnownCompetitionPeriod } from "@/lib/format/competition-period";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";

import type {
  MatchBroadcast,
  MatchBroadcastService,
} from "@/lib/db/queries/match-broadcasts";
import type { MatchListItem } from "@/lib/db/queries/matches";
import type { PoolStanding, StandingRow } from "@/lib/db/queries/standings";

export function formatMatchKickoffJst(
  kickoffAt: string,
  kickoffTimeTbd = false,
): string {
  return `${formatKickoffJstDate(kickoffAt)} ${formatKickoffJstTime(kickoffAt, kickoffTimeTbd)}`;
}

export function findNextScheduledMatch(
  matches: MatchListItem[],
  now = new Date(),
): MatchListItem | null {
  const nowTime = now.getTime();

  return (
    matches
      .filter(
        (match) =>
          match.status === "scheduled" &&
          new Date(match.kickoffAt).getTime() >= nowTime,
      )
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0] ?? null
  );
}

export type SeasonBroadcastGuide = {
  answer: string;
  services: MatchBroadcastService[];
};

function getLatestBroadcastServices(
  broadcasts: MatchBroadcast[],
): MatchBroadcast[] {
  const servicesByName = new Map<string, MatchBroadcast>();
  for (const broadcast of broadcasts) {
    const existing = servicesByName.get(broadcast.serviceName);
    if (
      !existing ||
      Date.parse(broadcast.verifiedAt) > Date.parse(existing.verifiedAt)
    ) {
      servicesByName.set(broadcast.serviceName, broadcast);
    }
  }
  return [...servicesByName.values()].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder ||
      left.serviceName.localeCompare(right.serviceName, "ja"),
  );
}

export function formatCompetitionBroadcastSentence(
  broadcastsByMatch: Map<string, MatchBroadcast[]>,
): string | null {
  const broadcasts = getLatestBroadcastServices(
    [...broadcastsByMatch.values()]
      .flat()
      .filter((broadcast) => broadcast.scope === "competition"),
  );
  if (broadcasts.length === 0) return null;
  const latestVerifiedAt = Math.max(
    ...broadcasts.map((broadcast) => Date.parse(broadcast.verifiedAt)),
  );
  const verifiedDate = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
  }).format(new Date(latestVerifiedAt));
  return `${broadcasts.map((broadcast) => broadcast.serviceName).join("・")}で全試合を視聴できます（${verifiedDate}確認）。`;
}

export function getSeasonBroadcastGuide(
  broadcastsByMatch: Map<string, MatchBroadcast[]>,
): SeasonBroadcastGuide {
  const rows = [...broadcastsByMatch.values()].flat();
  const broadcasts = getLatestBroadcastServices(rows);
  if (broadcasts.length === 0) {
    return {
      answer:
        "このシーズンの放送・配信情報は確認中です。最新情報は大会公式サイトをご確認ください。",
      services: [],
    };
  }
  const matchBroadcasts = getLatestBroadcastServices(
    rows.filter((broadcast) => broadcast.scope === "match"),
  );
  const answers: string[] = [];
  const competitionSentence =
    formatCompetitionBroadcastSentence(broadcastsByMatch);
  if (competitionSentence) {
    answers.push(
      `このシーズンは${competitionSentence}試合ごとのチャンネルや配信ページは各サービスの番組表でご確認ください。`,
    );
  }
  if (matchBroadcasts.length > 0) {
    answers.push(
      `掲載中の一部試合に視聴情報があります。対象試合の案内をご確認ください。確認済みのサービス: ${matchBroadcasts
        .map(
          (broadcast) =>
            `${broadcast.serviceName}（${broadcast.verifiedAt.slice(0, 10)}確認）`,
        )
        .join("、")}。`,
    );
  }
  return {
    answer: answers.join(""),
    services: broadcasts.map(({ displayOrder, kind, serviceName, url }) => ({
      displayOrder,
      kind,
      serviceName,
      url,
    })),
  };
}

export function isJapanMatch(match: MatchListItem): boolean {
  return match.homeTeam.slug === "japan" || match.awayTeam.slug === "japan";
}

export function getMatchLabel(match: MatchListItem): string {
  return `${match.homeTeam.name} 対 ${match.awayTeam.name}`;
}

export type CompetitionHubState = "active" | "information" | "post" | "pre";

export function getCompetitionHubState(
  matches: MatchListItem[],
): CompetitionHubState {
  const activeMatches = matches.filter((match) => match.status !== "cancelled");

  if (activeMatches.length === 0) {
    return "information";
  }

  if (activeMatches.every((match) => match.status === "scheduled")) {
    return "pre";
  }

  if (activeMatches.every((match) => match.status === "finished")) {
    return "post";
  }

  return "active";
}

export function selectStandingsExcerpt<
  T extends { teamName: string; teamShortCode: string },
>(standings: T[], includeJapan: boolean): T[] {
  const excerpt = new Map<string, T>();

  for (const row of standings.slice(0, 3)) {
    excerpt.set(row.teamName, row);
  }

  if (includeJapan) {
    for (const row of standings) {
      if (
        row.teamShortCode.toLowerCase() === "jpn" ||
        row.teamName.toLowerCase() === "japan" ||
        row.teamName === "日本"
      ) {
        excerpt.set(row.teamName, row);
      }
    }
  }

  return [...excerpt.values()].sort((left, right) => {
    const leftIndex = standings.indexOf(left);
    const rightIndex = standings.indexOf(right);

    return leftIndex - rightIndex;
  });
}

export function getLeaderLabel(args: {
  poolStandings: PoolStanding[];
  standings: StandingRow[];
  seasonNotStarted: boolean;
}): string | null {
  const { poolStandings, seasonNotStarted, standings } = args;

  return !seasonNotStarted && poolStandings.length > 0
    ? poolStandings
        .map((pool) =>
          pool.standings[0]
            ? `${formatPoolName(pool.poolName)}: ${pool.standings[0].teamName}`
            : null,
        )
        .filter((label): label is string => label !== null)
        .slice(0, 2)
        .join(" / ") || null
    : !seasonNotStarted
      ? (standings[0]?.teamName ?? null)
      : null;
}

function formatPeriodDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  return `${year}年${month}月${day}日`;
}

export function getSeasonPeriodLabel(args: {
  competitionSlug: string;
  matches: MatchListItem[];
  state: CompetitionHubState;
}): string | null {
  const knownPeriod = getKnownCompetitionPeriod(args.competitionSlug);

  if (knownPeriod) {
    const start = formatPeriodDate(knownPeriod.startDate);
    const end = formatPeriodDate(knownPeriod.endDate);

    return start === end ? start : `${start}〜${end}`;
  }

  if (args.state !== "post") {
    return null;
  }

  const dates = args.matches
    .filter((match) => match.status !== "cancelled")
    .map((match) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Asia/Tokyo",
        year: "numeric",
      }).formatToParts(new Date(match.kickoffAt));
      const dateParts = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
      );

      return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    })
    .sort();
  const firstDate = dates[0];
  const lastDate = dates.at(-1);

  if (!firstDate || !lastDate) {
    return null;
  }

  const start = formatPeriodDate(firstDate);
  const end = formatPeriodDate(lastDate);

  return start === end ? start : `${start}〜${end}`;
}

export function getJapanMatchesNote(args: {
  competitionSlug: string;
  matches: MatchListItem[];
}): string | null {
  if (args.competitionSlug !== "nations-championship-2026") {
    return null;
  }

  const hasJapanFinalsMatch = args.matches.some(
    (match) => isJapanMatch(match) && match.kickoffAt >= "2026-11-27T00:00:00Z",
  );

  return hasJapanFinalsMatch
    ? null
    : "11月27〜29日のファイナルズ週末（ロンドン・トゥイッケナム）で、日本は最終順位に応じた順位決定戦をもう1試合戦います。対戦相手と日時は第6節（11月21日）の後に決まります。";
}
