import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import {
  parseMatchEventsFromUrcDetailRowHtml,
} from "@/lib/scrapers/wikipedia-match-events";
import {
  mapWikipediaTeamName,
  normalizeWikipediaTeamName,
} from "@/lib/scrapers/wikipedia-team-name-map";

import type {
  WikipediaClubMatchDetails,
  WikipediaClubMatchDetailSource,
} from "@/lib/scrapers/wikipedia-club-match-details";

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;
const KNOCKOUT_ROUND_IDS = [
  "Quarter-finals",
  "Semi-finals",
  "URC_Grand_Final",
  "Grand_Final",
] as const;

const ROUND_ANCHOR_ID_ALIASES: Record<string, string[]> = {
  Grand_Final: ["Grand_Final", "URC_Grand_Final"],
  URC_Grand_Final: ["URC_Grand_Final", "Grand_Final"],
};

type ParsedUrcEventId =
  | {
      matchIndex: number;
      roundId: string;
      type: "index";
    }
  | {
      awayTeamName: string;
      homeTeamName: string;
      roundId: string;
      type: "teams";
    };

function findRoundTables(
  $: ReturnType<typeof load>,
  roundId: string,
) {
  const anchorIds = ROUND_ANCHOR_ID_ALIASES[roundId] ?? [roundId];
  const heading = anchorIds
    .map((anchorId) => $(`h2#${anchorId}, h3#${anchorId}`).first())
    .find((candidate) => candidate.length > 0);

  if (!heading?.length) {
    return [];
  }

  const headingWrapper = heading.closest(".mw-heading");
  let cursor = (headingWrapper.length ? headingWrapper : heading).next();
  const tables: unknown[] = [];

  while (cursor.length) {
    if (cursor.is("div.mw-heading")) {
      break;
    }

    if (cursor.is("table.mw-collapsible")) {
      const element = cursor.get(0);

      if (element) {
        tables.push(element);
      }

      cursor = cursor.next();
      continue;
    }

    cursor.find("table.mw-collapsible").each((_, element) => {
      tables.push(element);
    });

    cursor = cursor.next();
  }

  return tables;
}

function parseEventId(eventId: string): ParsedUrcEventId | null {
  const indexMatch = eventId.match(/^(Round_\d+)_(\d+)$/);

  if (indexMatch) {
    return {
      matchIndex: Number(indexMatch[2]),
      roundId: indexMatch[1]!,
      type: "index",
    };
  }

  const teamMatch = eventId.match(/^(Round_\d+)_(.+)_v_(.+)$/);

  if (teamMatch) {
    return {
      awayTeamName: teamMatch[3]!.replace(/_/g, " "),
      homeTeamName: teamMatch[2]!.replace(/_/g, " "),
      roundId: teamMatch[1]!,
      type: "teams",
    };
  }

  const knockoutTeamMatch = eventId.match(
    new RegExp(`^(${KNOCKOUT_ROUND_IDS.join("|")})_(.+)_v_(.+)$`, "i"),
  );

  if (knockoutTeamMatch) {
    return {
      awayTeamName: knockoutTeamMatch[3]!.replace(/_/g, " "),
      homeTeamName: knockoutTeamMatch[2]!.replace(/_/g, " "),
      roundId: knockoutTeamMatch[1]!,
      type: "teams",
    };
  }

  return null;
}

function comparableNameValues(name: string) {
  const normalized = normalizeWikipediaTeamName(name);
  const mapped = mapWikipediaTeamName(normalized);

  return [normalized, mapped]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean);
}

function namesMatch(left: string, right: string) {
  const leftValues = comparableNameValues(left);
  const rightValues = comparableNameValues(right);

  return leftValues.some((leftValue) =>
    rightValues.some(
      (rightValue) =>
        leftValue === rightValue ||
        leftValue.includes(rightValue) ||
        rightValue.includes(leftValue),
    ),
  );
}

function firstNonEmptyLinkText(
  $: ReturnType<typeof load>,
  cell: ReturnType<ReturnType<typeof load>>,
): string {
  return normalizeWikipediaTeamName(
    cell
      .find("a")
      .filter((_, element) => $(element).text().trim() !== "")
      .first()
      .text()
      .trim(),
  );
}

function findDetailRows(
  $: ReturnType<typeof load>,
  tables: unknown[],
) {
  const matches: Array<{
    awayTeamName: string;
    detailRowHtml: string;
    homeTeamName: string;
  }> = [];

  for (const table of tables) {
    const rows = $(table as any).find("tbody > tr").toArray();

    for (let index = 0; index < rows.length - 1; index += 2) {
      const infoRow = $(rows[index]!);

      if (!SCORE_PATTERN.test(infoRow.text())) {
        continue;
      }

      const cells = infoRow.children("td");
      const homeTeamName = firstNonEmptyLinkText($, cells.eq(1));
      const awayTeamName = firstNonEmptyLinkText($, cells.eq(3));
      const detailRow = rows[index + 1];

      if (!homeTeamName || !awayTeamName || !detailRow) {
        continue;
      }

      matches.push({
        awayTeamName,
        detailRowHtml: $.html($(detailRow)) ?? "",
        homeTeamName,
      });
    }
  }

  return matches;
}

export function parseWikipediaUrcMatchDetailsHtml(
  html: string,
  source: WikipediaClubMatchDetailSource,
): WikipediaClubMatchDetails {
  if (!source.eventId) {
    return { events: [], lineup: null };
  }

  const parsedEventId = parseEventId(source.eventId);

  if (!parsedEventId) {
    return { events: [], lineup: null };
  }

  const $ = load(html);
  const tables = findRoundTables($, parsedEventId.roundId);

  if (tables.length === 0) {
    return { events: [], lineup: null };
  }

  const detailRows = findDetailRows($, tables);

  if (parsedEventId.type === "index") {
    const detailRow = detailRows[parsedEventId.matchIndex];

    return {
      events: detailRow
        ? parseMatchEventsFromUrcDetailRowHtml(detailRow.detailRowHtml)
        : [],
      lineup: null,
    };
  }

  const matchedRows = detailRows.filter(
    (row) =>
      namesMatch(row.homeTeamName, parsedEventId.homeTeamName) &&
      namesMatch(row.awayTeamName, parsedEventId.awayTeamName),
  );

  if (matchedRows.length > 1) {
    console.warn(
      `[wikipedia-urc-match-details] multiple matches found for ${source.eventId}; using first match.`,
    );
  }

  const [detailRow] = matchedRows;

  return {
    events: detailRow
      ? parseMatchEventsFromUrcDetailRowHtml(detailRow.detailRowHtml)
      : [],
    lineup: null,
  };
}

export async function scrapeWikipediaUrcMatchDetails(
  source: WikipediaClubMatchDetailSource,
): Promise<WikipediaClubMatchDetails> {
  const response = await fetchWithPolicy(source.url);
  const html = await response.text();

  return parseWikipediaUrcMatchDetailsHtml(html, source);
}
