import { load } from "cheerio";
import { parse } from "date-fns";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type HistoricalMatchResult = {
  season: string;
  round: number | null;
  kickoff_at: string;
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  source_url: string;
  wikipedia_event_id: string | null;
};

export interface CompetitionResultScraper {
  fetchResults(season: string): Promise<HistoricalMatchResult[]>;
}

type Stage = {
  id: string;
  round: number;
};

const STAGES: Stage[] = [
  { id: "Relegation_play-off", round: 0 },
  { id: "Semi-final_Qualifiers", round: 1 },
  { id: "Semi-finals", round: 2 },
  { id: "Final", round: 3 },
];

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Bayonne: "bayonne",
  "Bordeaux Bègles": "bordeaux-begles",
  Castres: "castres",
  Clermont: "clermont",
  Grenoble: "grenoble",
  "La Rochelle": "la-rochelle",
  Lyon: "lyon",
  Montpellier: "montpellier",
  Pau: "pau",
  Perpignan: "perpignan",
  Racing: "racing-92",
  "Racing 92": "racing-92",
  "Stade Français": "stade-francais",
  Toulon: "toulon",
  Toulouse: "toulouse",
  Vannes: "vannes",
};

const TEAM_NAMES = Object.keys(TEAM_SLUG_BY_WIKIPEDIA_NAME).sort(
  (a, b) => b.length - a.length,
);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseSeason(season: string) {
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`Top 14 season must be YYYY-YY: ${season}`);
  }

  return season;
}

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_Top_14_season`;
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown Top 14 team name: ${teamName}`);
  }

  return slug;
}

function lastSundayOfMonthUtc(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());

  return date;
}

function isCentralEuropeanSummerTime(date: Date) {
  const year = date.getUTCFullYear();
  const startsAt = lastSundayOfMonthUtc(year, 2);
  startsAt.setUTCHours(1, 0, 0, 0);

  const endsAt = lastSundayOfMonthUtc(year, 9);
  endsAt.setUTCHours(1, 0, 0, 0);

  return date >= startsAt && date < endsAt;
}

function parseKickoffAt(dateText: string, timeText: string) {
  const parsedDate = parse(dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse Top 14 fixture date: ${dateText}`);
  }

  const [hoursText, minutesText] = timeText.split(":");
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
    throw new Error(`Unable to parse Top 14 fixture time: ${timeText}`);
  }

  const localDateAsUtc = new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours,
      minutes,
    ),
  );
  const timezoneOffset = isCentralEuropeanSummerTime(localDateAsUtc) ? 2 : 1;

  return new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours - timezoneOffset,
      minutes,
    ),
  ).toISOString();
}

function getSectionLines(
  $: ReturnType<typeof load>,
  sectionId: string,
): string[] {
  const heading = $(`#${sectionId}`).closest("div.mw-heading");

  if (heading.length === 0) {
    return [];
  }

  const level = heading.find("h2").length > 0 ? 2 : 3;
  const parts: string[] = [];
  let cursor = heading.next();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading")) {
      const cursorLevel = cursor.find("h2").length > 0 ? 2 : 3;

      if (cursorLevel <= level) {
        break;
      }
    }

    parts.push(cursor.text());
    cursor = cursor.next();
  }

  return normalizeWhitespace(parts.join("\n"))
    .split(
      /(?<!\d)(?=\d{1,2} [A-Z][a-z]+ \d{4})|(?=Attendance:)|(?=Referee:)|(?=\* \* \*)/,
    )
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function parseMatchLine(line: string) {
  const withoutMarkers = normalizeWhitespace(line.replace(/\([^)]*\)/g, " "));

  for (const homeTeamName of TEAM_NAMES) {
    if (!withoutMarkers.startsWith(homeTeamName)) {
      continue;
    }

    const afterHome = withoutMarkers.slice(homeTeamName.length).trim();
    const scoreMatch = afterHome.match(/^(\d+)\s*[–-]\s*(\d+)\s*(.+)$/);

    if (!scoreMatch) {
      continue;
    }

    const awayCandidate = normalizeWhitespace(scoreMatch[3] ?? "");
    const awayTeamName = TEAM_NAMES.find((name) =>
      awayCandidate.startsWith(name),
    );

    if (!awayTeamName) {
      continue;
    }

    return {
      awayScore: Number(scoreMatch[2]),
      awayTeamName,
      homeScore: Number(scoreMatch[1]),
      homeTeamName,
    };
  }

  return null;
}

function parseSection(
  $: ReturnType<typeof load>,
  stage: Stage,
  season: string,
  sourceUrl: string,
) {
  const lines = getSectionLines($, stage.id);
  const results: HistoricalMatchResult[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const dateMatch = lines[index]?.match(
      /^(\d{1,2} [A-Za-z]+ \d{4})\s+(\d{1,2}:\d{2})\s+(.+)$/,
    );

    if (!dateMatch) {
      continue;
    }

    const match = parseMatchLine(dateMatch[3]!);

    if (!match) {
      continue;
    }

    const venue = lines
      .slice(index + 1)
      .find(
        (line) =>
          !line.startsWith("Attendance:") &&
          !line.startsWith("Referee:") &&
          !line.includes("Try:"),
      );

    results.push({
      away_score: match.awayScore,
      away_team_slug: resolveTeamSlug(match.awayTeamName),
      home_score: match.homeScore,
      home_team_slug: resolveTeamSlug(match.homeTeamName),
      kickoff_at: parseKickoffAt(dateMatch[1]!, dateMatch[2]!),
      round: stage.round,
      season,
      source_url: sourceUrl,
      venue: venue ?? null,
      wikipedia_event_id: `${stage.id}_${match.homeTeamName.replace(/\s+/g, "_")}_v_${match.awayTeamName.replace(/\s+/g, "_")}`,
    });
  }

  return results;
}

export function parseTop14ResultsHtml(
  html: string,
  season: string,
  sourceUrl = buildWikipediaUrl(season),
): HistoricalMatchResult[] {
  const parsedSeason = parseSeason(season);
  const $ = load(html);
  const results = STAGES.flatMap((stage) =>
    parseSection($, stage, parsedSeason, sourceUrl),
  );

  if (results.length === 0) {
    throw new Error("No finished Top 14 playoff matches were found.");
  }

  return results;
}

export const wikipediaTop14ResultsScraper: CompetitionResultScraper = {
  async fetchResults(season: string) {
    const sourceUrl = buildWikipediaUrl(season);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();

    return parseTop14ResultsHtml(html, season, sourceUrl);
  },
};
