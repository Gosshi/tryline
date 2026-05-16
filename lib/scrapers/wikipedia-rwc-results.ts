import { load } from "cheerio";
import { parse } from "date-fns";

import {
  resolveRwcTeamSlug,
  RWC_2023_WIKIPEDIA_URL,
} from "@/lib/ingestion/sources/wikipedia-rwc";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";

export type RwcPhase =
  | "pool"
  | "quarter-final"
  | "semi-final"
  | "bronze-final"
  | "final";

export type RwcMatch = {
  kickoff_at: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  status: "finished" | "scheduled";
  venue: string | null;
  round: number | null;
  phase: RwcPhase;
  pool_name: string | null;
  event_id: string | null;
  source_url: string;
};

const SCORE_PATTERN = /^(\d+)\s*[–-]\s*(\d+)$/;
const POOL_IDS = ["Pool_A", "Pool_B", "Pool_C", "Pool_D"] as const;
const KNOCKOUT_PHASES = [
  { id: "Quarter-finals", phase: "quarter-final" as const, round: 5 },
  { id: "Semi-finals", phase: "semi-final" as const, round: 6 },
  { id: "Bronze_final", phase: "bronze-final" as const, round: 7 },
  { id: "Final", phase: "final" as const, round: 8 },
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseDateOnly(dateText: string) {
  const parsed = parse(dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse RWC date: ${dateText}`);
  }

  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0),
  ).toISOString();
}

function extractEventIdFromHref(href: string | undefined) {
  if (!href || !href.includes("#")) {
    return null;
  }

  return href.split("#")[1] ?? null;
}

function resolveWikipediaSourceUrl(sourceUrl: string, href: string | undefined) {
  if (!href) {
    return sourceUrl;
  }

  const absolute = new URL(href, sourceUrl);
  absolute.hash = "";

  return absolute.toString();
}

function findSectionHeading($: ReturnType<typeof load>, id: string) {
  return $(`#${id}`).closest(".mw-heading");
}

function getSectionNodes(
  $: ReturnType<typeof load>,
  heading: ReturnType<ReturnType<typeof load>>,
) {
  const nodes: Array<ReturnType<ReturnType<typeof load>>> = [];
  let cursor = heading.next();

  while (cursor.length > 0) {
    if (cursor.is(".mw-heading")) {
      break;
    }

    nodes.push(cursor);
    cursor = cursor.next();
  }

  return nodes;
}

function parsePoolMatches(
  $: ReturnType<typeof load>,
  sourceUrl: string,
): RwcMatch[] {
  const matches: RwcMatch[] = [];

  for (const poolId of POOL_IDS) {
    const heading = findSectionHeading($, poolId);

    if (heading.length === 0) {
      throw new Error(`Unable to locate RWC pool section: ${poolId}`);
    }

    const poolName = poolId.replace("_", " ");
    const sectionNodes = getSectionNodes($, heading);
    const matchTable = sectionNodes.find((node) => {
      if (!node.is("table")) {
        return false;
      }

      return node
        .find("tr")
        .toArray()
        .some((row) => {
          const cells = $(row).children("td");

          return cells.length >= 5 && SCORE_PATTERN.test(normalizeWhitespace(cells.eq(2).text()));
        });
    });

    if (!matchTable) {
      throw new Error(`Unable to locate RWC pool match table: ${poolName}`);
    }

    matchTable.find("tr").each((index, row) => {
      const cells = $(row).children("td");

      if (cells.length < 5) {
        return;
      }

      const scoreText = normalizeWhitespace(cells.eq(2).text());
      const matchedScore = scoreText.match(SCORE_PATTERN);

      if (!matchedScore) {
        return;
      }

      const homeTeamName = normalizeWhitespace(cells.eq(1).find("a").last().text());
      const awayTeamName = normalizeWhitespace(cells.eq(3).find("a").last().text());

      resolveRwcTeamSlug(homeTeamName);
      resolveRwcTeamSlug(awayTeamName);

      const scoreLink = cells.eq(2).find("a").first();

      matches.push({
        away_score: Number(matchedScore[2]),
        away_team_name: awayTeamName,
        event_id: extractEventIdFromHref(scoreLink.attr("href")),
        home_score: Number(matchedScore[1]),
        home_team_name: homeTeamName,
        kickoff_at: parseDateOnly(normalizeWhitespace(cells.eq(0).text())),
        phase: "pool",
        pool_name: poolName,
        round: Math.floor(index / 2) + 1,
        source_url: resolveWikipediaSourceUrl(sourceUrl, scoreLink.attr("href")),
        status: "finished",
        venue: normalizeWhitespace(cells.eq(4).text()) || null,
      });
    });
  }

  return matches;
}

function parseKnockoutMatches(
  $: ReturnType<typeof load>,
  sourceUrl: string,
): RwcMatch[] {
  const matches: RwcMatch[] = [];

  for (const phaseDef of KNOCKOUT_PHASES) {
    const heading = findSectionHeading($, phaseDef.id);

    if (heading.length === 0) {
      throw new Error(`Unable to locate RWC knockout section: ${phaseDef.id}`);
    }

    for (const node of getSectionNodes($, heading)) {
      if (!node.is("div.vevent.summary")) {
        continue;
      }

      const parsed = parseWikipediaSixNationsHtml($.html(node))[0];

      if (!parsed) {
        throw new Error(`Unable to parse RWC knockout vevent: ${phaseDef.id}`);
      }

      resolveRwcTeamSlug(parsed.homeTeamName);
      resolveRwcTeamSlug(parsed.awayTeamName);

      const scoreLink = node
        .find("a")
        .filter((_, element) =>
          SCORE_PATTERN.test(normalizeWhitespace($(element).text())),
        )
        .first();

      matches.push({
        away_score: parsed.awayScore,
        away_team_name: parsed.awayTeamName,
        event_id:
          extractEventIdFromHref(scoreLink.attr("href")) ?? parsed.eventId ?? null,
        home_score: parsed.homeScore,
        home_team_name: parsed.homeTeamName,
        kickoff_at: parsed.kickoffAt,
        phase: phaseDef.phase,
        pool_name: null,
        round: phaseDef.round,
        source_url: resolveWikipediaSourceUrl(sourceUrl, scoreLink.attr("href")),
        status: parsed.status,
        venue: parsed.venue,
      });
    }
  }

  return matches;
}

export function parseRwcHtml(
  html: string,
  sourceUrl: string = RWC_2023_WIKIPEDIA_URL,
): RwcMatch[] {
  const $ = load(html);
  const matches = [...parsePoolMatches($, sourceUrl), ...parseKnockoutMatches($, sourceUrl)];

  if (matches.length === 0) {
    throw new Error("No RWC 2023 matches were found in the Wikipedia page.");
  }

  return matches.sort((left, right) => left.kickoff_at.localeCompare(right.kickoff_at));
}
