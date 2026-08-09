import { parse } from "date-fns";

import { FetchError } from "@/lib/scrapers/errors";

import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations";

export type ParsedLiveMatch = ParsedWikipediaMatch & {
  awayTeamSlug?: string;
  homeTeamSlug?: string;
};

const SCORE_PATTERN = /(\d+)\s*[–-]\s*(\d+)/;

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseScoreText(scoreText: string) {
  const matched = normalizeWhitespace(scoreText).match(SCORE_PATTERN);

  if (!matched) {
    return {
      awayScore: null,
      homeScore: null,
      status: "scheduled" as const,
    };
  }

  return {
    awayScore: Number(matched[2]),
    homeScore: Number(matched[1]),
    status: "finished" as const,
  };
}

export function clearFutureZeroScores(
  matches: ParsedLiveMatch[],
  now = new Date(),
): ParsedLiveMatch[] {
  return matches.map((match) => {
    if (
      match.status !== "finished" ||
      match.homeScore !== 0 ||
      match.awayScore !== 0 ||
      new Date(match.kickoffAt) <= now
    ) {
      return match;
    }

    return {
      ...match,
      awayScore: null,
      homeScore: null,
      status: "scheduled" as const,
    };
  });
}

export function parseDmyDate(dateText: string) {
  const parsedDate = parse(dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse fixture date: ${dateText}`);
  }

  return parsedDate;
}

export function buildUtcIsoString(params: {
  dateText: string;
  offsetHours?: number;
  timeText?: string | null;
}) {
  const parsedDate = parseDmyDate(params.dateText);
  const [hoursText = "00", minutesText = "00"] = (
    params.timeText ?? "00:00"
  ).split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      `Unable to parse fixture time: ${params.timeText ?? "00:00"}`,
    );
  }

  return new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours - (params.offsetHours ?? 0),
      minutes,
    ),
  ).toISOString();
}

export function isMissingWikipediaPage(error: unknown) {
  return error instanceof FetchError && error.status === 404;
}

export function toEmptyWhenMissingOrUnstructured<T>(
  callback: () => T,
  emptyMessages: string[],
): T | [] {
  try {
    return callback();
  } catch (error) {
    if (
      error instanceof Error &&
      emptyMessages.some((message) => error.message.includes(message))
    ) {
      return [];
    }

    throw error;
  }
}

export function mapWithTeamSlugs(
  matches: ParsedWikipediaMatch[],
  slugsByName: Record<string, string>,
): ParsedLiveMatch[] {
  return matches.flatMap((match) => {
    const homeTeamSlug = slugsByName[match.homeTeamName];
    const awayTeamSlug = slugsByName[match.awayTeamName];

    if (!homeTeamSlug || !awayTeamSlug) {
      console.warn(
        `Skipping live match with unknown team: ${match.homeTeamName} vs ${match.awayTeamName}`,
      );
      return [];
    }

    return [
      {
        ...match,
        awayTeamSlug,
        homeTeamSlug,
      },
    ];
  });
}
