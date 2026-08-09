import { load } from "cheerio";

import {
  buildUtcIsoString,
  isMissingWikipediaPage,
  normalizeWhitespace,
  parseScoreText,
} from "@/lib/ingestion/sources/live-source-utils";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

type Stage = { id: string; round: number };
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

function buildSeasonUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Super_Rugby_Pacific_season`;
}

function buildRegularMatchesUrl(season: string) {
  return `https://en.wikipedia.org/wiki/List_of_${season}_Super_Rugby_Pacific_matches`;
}

function parseKickoffAtFromBlockText(blockText: string) {
  const normalized = normalizeWhitespace(blockText);
  const matched = normalized.match(
    /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})\s+(?:[A-Z]+\s+)?\(UTC([+-]\d{1,2})\)/,
  );

  if (!matched) {
    throw new Error(
      `Unable to locate Super Rugby Pacific fixture kickoff text: ${normalized}`,
    );
  }

  return buildUtcIsoString({
    dateText: matched[1]!,
    offsetHours: Number(matched[3]),
    timeText: matched[2]!,
  });
}

function parseVeventSectionsHtml(
  html: string,
  resolveRound: SectionRoundResolver,
  wikipediaUrl: string | null,
): ParsedLiveMatch[] {
  const $ = load(html);
  let currentRound: number | null = null;
  const results: ParsedLiveMatch[] = [];

  $("div.mw-heading, div.vevent.summary").each((_, element) => {
    const block = $(element);

    if (block.is("div.mw-heading")) {
      currentRound = resolveRound(block.find("h2, h3").attr("id"));
      return;
    }

    if (currentRound === null) {
      return;
    }

    const tables = block.find("table");
    const dateTable = tables.eq(0);
    const matchupTable = tables.eq(1);
    const cells = matchupTable.find("tr").first().find("td");
    const score = parseScoreText(cells.eq(1).text());
    const homeTeamName = normalizeWhitespace(
      cells.eq(0).find("a").last().text(),
    );
    const awayTeamName = normalizeWhitespace(
      cells.eq(2).find("a").last().text(),
    );
    const homeTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[homeTeamName];
    const awayTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[awayTeamName];

    if (!homeTeamName || !awayTeamName || !homeTeamSlug || !awayTeamSlug) {
      console.warn(
        `Skipping live match with unknown team: ${homeTeamName} vs ${awayTeamName}`,
      );
      return;
    }

    results.push({
      awayScore: score.awayScore,
      awayTeamName,
      awayTeamSlug,
      eventId:
        block.attr("id") ??
        `${currentRound}_${homeTeamName.replace(/\s+/g, "_")}_v_${awayTeamName.replace(/\s+/g, "_")}`,
      homeScore: score.homeScore,
      homeTeamName,
      homeTeamSlug,
      kickoffAt: parseKickoffAtFromBlockText(dateTable.text()),
      lineupTableHtml: null,
      rawHtml: $.html(block),
      round: currentRound,
      roundName: null,
      status: score.status,
      venue:
        normalizeWhitespace(block.find(".location").first().text()) || null,
      wikipediaUrl,
    });
  });

  return results;
}

export function parseSuperRugbyPacificLiveHtml(params: {
  regularHtml: string;
  regularWikipediaUrl?: string | null;
  seasonHtml: string;
  seasonWikipediaUrl?: string | null;
}): ParsedLiveMatch[] {
  const stageById = new Map(FINALS_STAGES.map((stage) => [stage.id, stage]));

  return [
    ...parseVeventSectionsHtml(
      params.regularHtml,
      (id) => {
        const matched = id?.match(ROUND_ID_PATTERN);

        return matched?.[1] ? Number(matched[1]) : null;
      },
      params.regularWikipediaUrl ?? null,
    ),
    ...parseVeventSectionsHtml(
      params.seasonHtml,
      (id) => stageById.get(id ?? "")?.round ?? null,
      params.seasonWikipediaUrl ?? null,
    ),
  ];
}

export async function fetchSuperRugbyPacific2026(): Promise<ParsedLiveMatch[]> {
  const seasonUrl = buildSeasonUrl("2026");
  const regularSourceUrl = buildRegularMatchesUrl("2026");

  try {
    const [regularResponse, seasonResponse] = await Promise.all([
      fetchWithPolicy(regularSourceUrl),
      fetchWithPolicy(seasonUrl),
    ]);
    const [regularHtml, seasonHtml] = await Promise.all([
      regularResponse.text(),
      seasonResponse.text(),
    ]);

    return parseSuperRugbyPacificLiveHtml({
      regularHtml,
      regularWikipediaUrl: regularSourceUrl,
      seasonHtml,
      seasonWikipediaUrl: seasonUrl,
    });
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
