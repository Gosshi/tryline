import { load } from "cheerio";
import { parse } from "date-fns";

import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
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

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Canada: "canada",
  Fiji: "fiji",
  Japan: "japan",
  Samoa: "samoa",
  Tonga: "tonga",
  USA: "usa",
  "United States": "usa",
};
const POOL_SECTION_IDS = ["Pool_A", "Pool_B"];
const FINALS_ROUNDS: Record<string, number> = {
  Bronze_Final: 5,
  "Fifth-place_play-off": 4,
  Grand_Final: 6,
  "Semi-finals": 4,
};

type SectionVevent = {
  html: string;
  kickoffTime: number;
};

function parseSeason(season: string) {
  if (!/^\d{4}$/.test(season)) {
    throw new Error(`Pacific Nations Cup season must be YYYY: ${season}`);
  }

  return Number(season);
}

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_World_Rugby_Pacific_Nations_Cup`;
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown Pacific Nations Cup team name: ${teamName}`);
  }

  return slug;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseKickoffTime(value: string) {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(/(\d{1,2} [A-Za-z]+ \d{4})/);

  if (!matched) {
    throw new Error(
      `Unable to locate Pacific Nations Cup fixture date: ${normalized}`,
    );
  }

  const parsedDate = parse(matched[1]!, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(
      `Unable to parse Pacific Nations Cup fixture date: ${matched[1]}`,
    );
  }

  return parsedDate.getTime();
}

function collectSectionVevents(
  $: ReturnType<typeof load>,
  sectionId: string,
): SectionVevent[] {
  const heading = $(`#${sectionId}`).closest("div.mw-heading");

  if (heading.length === 0) {
    return [];
  }

  const blocks: SectionVevent[] = [];
  let cursor = heading.next();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading") && cursor.find("h2, h3").length > 0) {
      break;
    }

    if (cursor.is("div.vevent.summary")) {
      blocks.push({
        html: $.html(cursor),
        kickoffTime: parseKickoffTime(cursor.find("table").eq(0).text()),
      });
    }

    cursor = cursor.next();
  }

  return blocks;
}

function buildRoundHeading(round: number) {
  return `<div class="mw-heading mw-heading3"><h3 id="Round_${round}">Round ${round}</h3></div>`;
}

function wrapVeventsWithFixturesSection(html: string) {
  const $ = load(html);
  const roundBlocks = new Map<number, string[]>();

  for (const sectionId of POOL_SECTION_IDS) {
    const blocks = collectSectionVevents($, sectionId).sort(
      (a, b) => a.kickoffTime - b.kickoffTime,
    );

    blocks.forEach((block, index) => {
      const round = index + 1;
      roundBlocks.set(round, [...(roundBlocks.get(round) ?? []), block.html]);
    });
  }

  for (const [sectionId, round] of Object.entries(FINALS_ROUNDS)) {
    const blocks = collectSectionVevents($, sectionId);

    if (blocks.length > 0) {
      roundBlocks.set(round, [
        ...(roundBlocks.get(round) ?? []),
        ...blocks.map((block) => block.html),
      ]);
    }
  }

  if (roundBlocks.size === 0) {
    throw new Error("No Pacific Nations Cup vevent blocks were found.");
  }

  const rounds = [...roundBlocks.entries()].sort((a, b) => a[0] - b[0]);

  return [
    '<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>',
    ...rounds.flatMap(([round, blocks]) => [
      buildRoundHeading(round),
      ...blocks,
    ]),
  ].join("\n");
}

export function parsePacificNationsCupResultsHtml(
  html: string,
  season: string,
  sourceUrl = buildWikipediaUrl(season),
): HistoricalMatchResult[] {
  const seasonNumber = parseSeason(season);
  const parsedMatches = parseWikipediaSixNationsHtml(
    wrapVeventsWithFixturesSection(html),
  );

  return parsedMatches
    .filter((match) => match.status === "finished")
    .map((match) => {
      if (match.homeScore === null || match.awayScore === null) {
        throw new Error(
          `Missing score for Pacific Nations Cup ${season}: ${match.homeTeamName} vs ${match.awayTeamName}`,
        );
      }

      return {
        away_score: match.awayScore,
        away_team_slug: resolveTeamSlug(match.awayTeamName),
        home_score: match.homeScore,
        home_team_slug: resolveTeamSlug(match.homeTeamName),
        kickoff_at: match.kickoffAt,
        round: match.round,
        season: seasonNumber,
        source_url: sourceUrl,
        venue: match.venue,
        wikipedia_event_id: match.eventId,
      };
    });
}

export const wikipediaPacificNationsCupResultsScraper: CompetitionResultScraper =
  {
    async fetchResults(season: string) {
      const sourceUrl = buildWikipediaUrl(season);
      const response = await fetchWithPolicy(sourceUrl);
      const html = await response.text();

      return parsePacificNationsCupResultsHtml(html, season, sourceUrl);
    },
  };
