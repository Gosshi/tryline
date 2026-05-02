import { load } from "cheerio";

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
  { id: "Cuartos_de_final", round: 1 },
  { id: "Semifinal", round: 2 },
  { id: "Tercer_puesto", round: 3 },
  { id: "Final", round: 4 },
];

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  "Black Rams": "ricoh-black-rams",
  "Black Rams Tokyo": "ricoh-black-rams",
  "Blue Revs": "shizuoka-blue-revs",
  "Brave Lupus": "toshiba-brave-lupus",
  "Brave Lupus Tokyo": "toshiba-brave-lupus",
  "Canon Eagles": "canon-eagles",
  "D-Rocks": "urayasu-d-rocks",
  Dynaboars: "mitsubishi-dynaboars",
  "Honda Heat": "honda-heat",
  "Kobe Steelers": "kobelco-kobe-steelers",
  "Saitama Wild Knights": "saitama-wild-knights",
  "Shizuoka Blue Revs": "shizuoka-blue-revs",
  Spears: "kubota-spears",
  "Spears Tokyo Bay": "kubota-spears",
  Sungoliath: "tokyo-suntory-sungoliath",
  "Tokyo Sungoliath": "tokyo-suntory-sungoliath",
  Verblitz: "toyota-verblitz",
};

const TEAM_NAMES = Object.keys(TEAM_SLUG_BY_WIKIPEDIA_NAME).sort(
  (a, b) => b.length - a.length,
);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseSeason(season: string) {
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`League One season must be YYYY-YY: ${season}`);
  }

  return season;
}

function buildWikipediaUrl(season: string) {
  const startYear = season.slice(0, 4);

  return `https://es.wikipedia.org/wiki/Japan_Rugby_League_One_${startYear}-${season.slice(5)}`;
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown League One team name: ${teamName}`);
  }

  return slug;
}

function parseKickoffAt(dateText: string) {
  const matched = normalizeWhitespace(dateText).match(
    /^(\d{1,2}) de ([a-z]+) de (\d{4})$/i,
  );

  if (!matched) {
    throw new Error(`Unable to parse League One fixture date: ${dateText}`);
  }

  const day = Number(matched[1]);
  const month = SPANISH_MONTHS[matched[2]!.toLowerCase()];
  const year = Number(matched[3]);

  if (
    Number.isNaN(day) ||
    month === undefined ||
    Number.isNaN(year) ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(`Unable to parse League One fixture date: ${dateText}`);
  }

  return new Date(Date.UTC(year, month, day)).toISOString();
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
  const withoutSeeds = normalizeWhitespace(line.replace(/\([^)]*\)/g, " "));

  for (const homeTeamName of TEAM_NAMES) {
    if (!withoutSeeds.startsWith(homeTeamName)) {
      continue;
    }

    const afterHome = withoutSeeds.slice(homeTeamName.length).trim();
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
      remainder: awayCandidate.slice(awayTeamName.length).trim(),
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
    .split(/(?<!\d)(?=\d{1,2} de [a-z]+ de \d{4})/i)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter(Boolean);

  return chunks.flatMap((chunk) => {
    const dateMatch = chunk.match(/^(\d{1,2} de [a-z]+ de \d{4})\s+(.+)$/i);

    if (!dateMatch) {
      return [];
    }

    const match = parseMatchLine(dateMatch[2]!);

    if (!match) {
      return [];
    }

    const venueMatch = match.remainder.match(
      /^(.*?)(?:\s+Entrenador:|\s+Árbitro:|\s+Asistencia:|Campeón|$)/,
    );

    return [
      {
        away_score: match.awayScore,
        away_team_slug: resolveTeamSlug(match.awayTeamName),
        home_score: match.homeScore,
        home_team_slug: resolveTeamSlug(match.homeTeamName),
        kickoff_at: parseKickoffAt(dateMatch[1]!),
        round: stage.round,
        season,
        source_url: sourceUrl,
        venue: venueMatch?.[1] ? normalizeWhitespace(venueMatch[1]) : null,
        wikipedia_event_id: `${stage.id}_${match.homeTeamName.replace(/\s+/g, "_")}_v_${match.awayTeamName.replace(/\s+/g, "_")}`,
      },
    ];
  });
}

export function parseLeagueOneResultsHtml(
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
    throw new Error("No finished League One playoff matches were found.");
  }

  return results;
}

export const wikipediaLeagueOneResultsScraper: CompetitionResultScraper = {
  async fetchResults(season: string) {
    const sourceUrl = buildWikipediaUrl(season);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();

    return parseLeagueOneResultsHtml(html, season, sourceUrl);
  },
};
