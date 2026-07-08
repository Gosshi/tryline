import { load } from "cheerio";
import { parse } from "date-fns";

import {
  isMissingWikipediaPage,
  normalizeWhitespace,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

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
const CONDENSED_FORMAT_ROUNDS: Record<string, number> = {
  Grand_Final: 102,
  "Semi-finals": 101,
  "Third_place_play-off": 103,
};

type SectionVevent = {
  html: string;
  kickoffTime: number;
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_World_Rugby_Pacific_Nations_Cup`;
}

function parseKickoffTime(value: string) {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(/(\d{1,2} [A-Za-z]+ \d{4})/);

  if (!matched) {
    throw new Error(`Unable to locate Nations Cup fixture date: ${normalized}`);
  }

  const parsedDate = parse(matched[1]!, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse Nations Cup fixture date: ${matched[1]}`);
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
  function isBoundary(element: ReturnType<ReturnType<typeof load>>) {
    return (
      (element.is("div.mw-heading") && element.find("h2, h3").length > 0) ||
      (element.is("section") &&
        element.children("div.mw-heading").find("h2, h3").length > 0)
    );
  }

  function collectFromElement(element: ReturnType<ReturnType<typeof load>>) {
    if (element.is("div.vevent.summary")) {
      blocks.push({
        html: $.html(element),
        kickoffTime: parseKickoffTime(element.find("table").eq(0).text()),
      });
      return;
    }

    if (element.is("section")) {
      element.children().each((_, child) => {
        const childElement = $(child);

        if (!isBoundary(childElement)) {
          collectFromElement(childElement);
        }
      });
    }
  }

  let cursor = heading.next();

  while (cursor.length > 0) {
    if (isBoundary(cursor)) {
      break;
    }

    collectFromElement(cursor);
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
  let poolBlockCount = 0;

  for (const sectionId of POOL_SECTION_IDS) {
    const blocks = collectSectionVevents($, sectionId).sort(
      (a, b) => a.kickoffTime - b.kickoffTime,
    );
    poolBlockCount += blocks.length;

    blocks.forEach((block, index) => {
      const round = index + 1;
      roundBlocks.set(round, [...(roundBlocks.get(round) ?? []), block.html]);
    });
  }

  const sectionRounds =
    poolBlockCount > 0 ? FINALS_ROUNDS : CONDENSED_FORMAT_ROUNDS;

  for (const [sectionId, round] of Object.entries(sectionRounds)) {
    const blocks = collectSectionVevents($, sectionId);

    if (blocks.length > 0) {
      roundBlocks.set(round, [
        ...(roundBlocks.get(round) ?? []),
        ...blocks.map((block) => block.html),
      ]);
    }
  }

  if (roundBlocks.size === 0) {
    return "";
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

function attachKnownPncTeamSlugs(matches: ParsedLiveMatch[]): ParsedLiveMatch[] {
  return matches.map((match) => {
    const homeTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[match.homeTeamName];
    const awayTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[match.awayTeamName];

    return {
      ...match,
      ...(awayTeamSlug ? { awayTeamSlug } : {}),
      ...(homeTeamSlug ? { homeTeamSlug } : {}),
    };
  });
}

export function parsePncLiveHtml(html: string): ParsedLiveMatch[] {
  const wrappedHtml = wrapVeventsWithFixturesSection(html);

  if (!wrappedHtml) {
    return [];
  }

  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(wrappedHtml),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return attachKnownPncTeamSlugs(parsedMatches);
}

export async function fetchPnc2026(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl("2026");

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parsePncLiveHtml(await response.text());
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
