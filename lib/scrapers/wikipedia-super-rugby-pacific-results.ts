import { load } from "cheerio";
import { parse } from "date-fns";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type HistoricalMatchResult = {
  season: number;
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
type RoundSection = { id: string; round: number };
type SectionRoundResolver = (id: string | undefined) => number | null;

const ROUND_ID_PATTERN = /^Round_(\d+)(?:_|$)/;

const FINALS_STAGES: Stage[] = [
  { id: "Qualifying_finals", round: 17 },
  { id: "Semi-finals", round: 18 },
  { id: "Final", round: 19 },
];

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Blues: "blues",
  Brumbies: "brumbies",
  Chiefs: "chiefs",
  Crusaders: "crusaders",
  Drua: "fijian-drua",
  Force: "force",
  Highlanders: "highlanders",
  Hurricanes: "hurricanes",
  "Moana Pasifika": "moana-pasifika",
  Reds: "reds",
  Waratahs: "waratahs",
};

const TEAM_NAMES = Object.keys(TEAM_SLUG_BY_WIKIPEDIA_NAME).sort(
  (a, b) => b.length - a.length,
);
const SCORE_PATTERN = /(\d+)\s*[–-]\s*(\d+)/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseSeason(season: string) {
  if (!/^\d{4}$/.test(season)) {
    throw new Error(`Super Rugby Pacific season must be YYYY: ${season}`);
  }

  return Number(season);
}

function buildSeasonUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Super_Rugby_Pacific_season`;
}

function buildRegularMatchesUrl(season: string) {
  return `https://en.wikipedia.org/wiki/List_of_${season}_Super_Rugby_Pacific_matches`;
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown Super Rugby Pacific team name: ${teamName}`);
  }

  return slug;
}

function parseKickoffAt(
  dateText: string,
  timeText: string,
  offsetText: string,
) {
  const parsedDate = parse(dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(
      `Unable to parse Super Rugby Pacific fixture date: ${dateText}`,
    );
  }

  const [hoursText, minutesText] = timeText.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const offset = Number(offsetText);

  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(offset)) {
    throw new Error(
      `Unable to parse Super Rugby Pacific fixture time: ${timeText} UTC${offsetText}`,
    );
  }

  return new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours - offset,
      minutes,
    ),
  ).toISOString();
}

function parseKickoffAtFromBlockText(blockText: string) {
  const normalized = normalizeWhitespace(blockText);
  const matched = normalized.match(
    /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})\s+\(UTC([+-]\d{1,2})\)/,
  );

  if (!matched) {
    throw new Error(
      `Unable to locate Super Rugby Pacific fixture kickoff text: ${normalized}`,
    );
  }

  return parseKickoffAt(matched[1]!, matched[2]!, matched[3]!);
}

function parseScore(scoreText: string) {
  const matched = normalizeWhitespace(scoreText).match(SCORE_PATTERN);

  if (!matched) {
    return null;
  }

  return {
    awayScore: Number(matched[2]),
    homeScore: Number(matched[1]),
  };
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
      remainder: awayCandidate.slice(awayTeamName.length).trim(),
    };
  }

  return null;
}

function parseSectionText(params: {
  round: number | null;
  season: number;
  sourceUrl: string;
  text: string;
}) {
  const chunks = params.text
    .split(/(?<!\d)(?=\d{1,2} [A-Z][a-z]+ \d{4})/)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter(Boolean);

  return chunks.flatMap((chunk) => {
    const dateMatch = chunk.match(
      /^(\d{1,2} [A-Za-z]+ \d{4})\s+(\d{1,2}:\d{2})\s+\(UTC([+-]\d{1,2})\)\s+(.+)$/,
    );

    if (!dateMatch) {
      return [];
    }

    const match = parseMatchLine(dateMatch[4]!);

    if (!match) {
      return [];
    }

    const venueMatch = match.remainder.match(
      /^(.+?)(?:\s+Try:|\s+Attendance:|\s+Referee:|$)/,
    );

    return [
      {
        away_score: match.awayScore,
        away_team_slug: resolveTeamSlug(match.awayTeamName),
        home_score: match.homeScore,
        home_team_slug: resolveTeamSlug(match.homeTeamName),
        kickoff_at: parseKickoffAt(dateMatch[1]!, dateMatch[2]!, dateMatch[3]!),
        round: params.round,
        season: params.season,
        source_url: params.sourceUrl,
        venue: venueMatch?.[1] ? normalizeWhitespace(venueMatch[1]) : null,
        wikipedia_event_id: `${params.round ?? "match"}_${match.homeTeamName.replace(/\s+/g, "_")}_v_${match.awayTeamName.replace(/\s+/g, "_")}`,
      },
    ];
  });
}

function parseRegularResultsHtml(
  html: string,
  season: number,
  sourceUrl: string,
) {
  const $ = load(html);
  const veventResults = parseVeventSectionsHtml($, season, sourceUrl, (id) => {
    const matched = id?.match(ROUND_ID_PATTERN);

    return matched?.[1] ? Number(matched[1]) : null;
  });

  if (veventResults.length > 0) {
    return veventResults;
  }

  const roundSections: RoundSection[] = [];

  $("div.mw-heading h2, div.mw-heading h3").each((_, element) => {
    const id = $(element).attr("id");
    const matched = id?.match(ROUND_ID_PATTERN);

    if (id && matched?.[1]) {
      roundSections.push({
        id,
        round: Number(matched[1]),
      });
    }
  });

  const uniqueRoundSections = [
    ...new Map(
      roundSections.map((section) => [section.round, section]),
    ).values(),
  ].sort((a, b) => a.round - b.round);

  const results: HistoricalMatchResult[] = [];

  for (const section of uniqueRoundSections) {
    results.push(
      ...parseSectionText({
        round: section.round,
        season,
        sourceUrl,
        text: getSectionText($, section.id),
      }),
    );
  }

  return results;
}

function parseFinalsResultsHtml(
  html: string,
  season: number,
  sourceUrl: string,
) {
  const $ = load(html);
  const stageById = new Map(FINALS_STAGES.map((stage) => [stage.id, stage]));
  const veventResults = parseVeventSectionsHtml(
    $,
    season,
    sourceUrl,
    (id) => stageById.get(id ?? "")?.round ?? null,
  );

  if (veventResults.length > 0) {
    return veventResults;
  }

  return FINALS_STAGES.flatMap((stage) =>
    parseSectionText({
      round: stage.round,
      season,
      sourceUrl,
      text: getSectionText($, stage.id),
    }),
  );
}

function parseVeventSectionsHtml(
  $: ReturnType<typeof load>,
  season: number,
  sourceUrl: string,
  resolveRound: SectionRoundResolver,
) {
  let currentRound: number | null = null;
  const results: HistoricalMatchResult[] = [];

  $("div.mw-heading, div.vevent.summary").each((_, element) => {
    const block = $(element);

    if (block.is("div.mw-heading")) {
      currentRound = resolveRound(block.find("h2, h3").attr("id"));
      return;
    }

    if (currentRound !== null) {
      const tables = block.find("table");
      const dateTable = tables.eq(0);
      const matchupTable = tables.eq(1);
      const cells = matchupTable.find("tr").first().find("td");
      const score = parseScore(cells.eq(1).text());
      const homeTeamName = normalizeWhitespace(
        cells.eq(0).find("a").last().text(),
      );
      const awayTeamName = normalizeWhitespace(
        cells.eq(2).find("a").last().text(),
      );

      if (!score || !homeTeamName || !awayTeamName) {
        return;
      }

      results.push({
        away_score: score.awayScore,
        away_team_slug: resolveTeamSlug(awayTeamName),
        home_score: score.homeScore,
        home_team_slug: resolveTeamSlug(homeTeamName),
        kickoff_at: parseKickoffAtFromBlockText(dateTable.text()),
        round: currentRound,
        season,
        source_url: sourceUrl,
        venue:
          normalizeWhitespace(block.find(".location").first().text()) || null,
        wikipedia_event_id:
          block.attr("id") ??
          `${currentRound}_${homeTeamName.replace(/\s+/g, "_")}_v_${awayTeamName.replace(/\s+/g, "_")}`,
      });
    }
  });

  return results;
}

export function parseSuperRugbyPacificResultsHtml(params: {
  regularHtml: string;
  season: string;
  seasonHtml: string;
  regularSourceUrl?: string;
  seasonSourceUrl?: string;
}): HistoricalMatchResult[] {
  const seasonNumber = parseSeason(params.season);
  const regularSourceUrl =
    params.regularSourceUrl ?? buildRegularMatchesUrl(params.season);
  const seasonSourceUrl =
    params.seasonSourceUrl ?? buildSeasonUrl(params.season);
  const results = [
    ...parseRegularResultsHtml(
      params.regularHtml,
      seasonNumber,
      regularSourceUrl,
    ),
    ...parseFinalsResultsHtml(params.seasonHtml, seasonNumber, seasonSourceUrl),
  ];

  if (results.length === 0) {
    throw new Error("No finished Super Rugby Pacific matches were found.");
  }

  return results;
}

export const wikipediaSuperRugbyPacificResultsScraper: CompetitionResultScraper =
  {
    async fetchResults(season: string) {
      const seasonUrl = buildSeasonUrl(season);
      const regularSourceUrl = buildRegularMatchesUrl(season);
      const [regularResponse, seasonResponse] = await Promise.all([
        fetchWithPolicy(regularSourceUrl),
        fetchWithPolicy(seasonUrl),
      ]);
      const [regularHtml, seasonHtml] = await Promise.all([
        regularResponse.text(),
        seasonResponse.text(),
      ]);

      return parseSuperRugbyPacificResultsHtml({
        regularHtml,
        regularSourceUrl,
        season,
        seasonHtml,
        seasonSourceUrl: seasonUrl,
      });
    },
  };
