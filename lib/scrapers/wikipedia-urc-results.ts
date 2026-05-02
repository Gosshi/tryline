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

type Stage = { id: string; round: number };

const STAGES: Stage[] = [
  { id: "Quarter-finals", round: 1 },
  { id: "Semi-finals", round: 2 },
  { id: "URC_Grand_Final", round: 3 },
];

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Benetton: "benetton",
  Bulls: "bulls",
  Cardiff: "cardiff",
  Connacht: "connacht",
  Dragons: "dragons",
  Edinburgh: "edinburgh",
  "Glasgow Warriors": "glasgow-warriors",
  Leinster: "leinster",
  Lions: "lions",
  Munster: "munster",
  Ospreys: "ospreys",
  Scarlets: "scarlets",
  Sharks: "sharks",
  Stormers: "stormers",
  Ulster: "ulster",
  "Zebre Parma": "zebre",
};

const TEAM_NAMES = Object.keys(TEAM_SLUG_BY_WIKIPEDIA_NAME).sort(
  (a, b) => b.length - a.length,
);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseSeason(season: string) {
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`URC season must be YYYY-YY: ${season}`);
  }

  return season;
}

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_United_Rugby_Championship`;
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown URC team name: ${teamName}`);
  }

  return slug;
}

function parseKickoffAt(dateText: string, timeText: string | null) {
  const parsedDate = parse(dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse URC fixture date: ${dateText}`);
  }

  const [hoursText = "00", minutesText = "00"] = (timeText ?? "00:00").split(
    ":",
  );
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Unable to parse URC fixture time: ${timeText ?? "00:00"}`);
  }

  return new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours,
      minutes,
    ),
  ).toISOString();
}

function getSectionText($: ReturnType<typeof load>, sectionId: string) {
  const heading = $(`#${sectionId}`).closest("div.mw-heading");

  if (heading.length === 0) {
    return "";
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

  return normalizeWhitespace(parts.join("\n"));
}

function parseMatchLine(line: string) {
  const withoutMarkers = normalizeWhitespace(
    line.replace(/\([^)]*\)/g, " ").replace(/\s+on pens\./gi, " "),
  );

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
  const text = getSectionText($, stage.id);
  const chunks = text
    .split(/(?<!\d)(?=\d{1,2} [A-Z][a-z]+ \d{4})/)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter(Boolean);

  return chunks.flatMap((chunk) => {
    const dateMatch = chunk.match(/^(\d{1,2} [A-Za-z]+ \d{4})\s+(.+)$/);

    if (!dateMatch) {
      return [];
    }

    let rest = dateMatch[2]!;
    const timeMatch = rest.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
    const timeText = timeMatch?.[1] ?? null;

    if (timeMatch) {
      rest = timeMatch[2]!;
    }

    const match = parseMatchLine(rest);

    if (!match) {
      return [];
    }

    const venueMatch = rest.match(
      /\s{2,}([^]*?)(?:\s+Try:|\s+Attendance:|\s+Referee:|$)/,
    );
    const venue = venueMatch?.[1] ? normalizeWhitespace(venueMatch[1]) : null;

    return [
      {
        away_score: match.awayScore,
        away_team_slug: resolveTeamSlug(match.awayTeamName),
        home_score: match.homeScore,
        home_team_slug: resolveTeamSlug(match.homeTeamName),
        kickoff_at: parseKickoffAt(dateMatch[1]!, timeText),
        round: stage.round,
        season,
        source_url: sourceUrl,
        venue,
        wikipedia_event_id: `${stage.id}_${match.homeTeamName.replace(/\s+/g, "_")}_v_${match.awayTeamName.replace(/\s+/g, "_")}`,
      },
    ];
  });
}

export function parseUrcResultsHtml(
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
    throw new Error("No finished URC knockout matches were found.");
  }

  return results;
}

export const wikipediaUrcResultsScraper: CompetitionResultScraper = {
  async fetchResults(season: string) {
    const sourceUrl = buildWikipediaUrl(season);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();

    return parseUrcResultsHtml(html, season, sourceUrl);
  },
};
