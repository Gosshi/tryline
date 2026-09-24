import { load } from "cheerio";

export function extractEventHtml(
  html: string,
  eventId: string | null,
): string | null {
  if (!eventId || eventId === "mw-content-text") {
    return null;
  }

  const $ = load(html);
  const eventBlock = $("[id]")
    .filter((_, element) => $(element).attr("id") === eventId)
    .first();

  return eventBlock.length ? $.html(eventBlock) : null;
}

const MONTH_INDEX_BY_NAME = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index]),
);

function toUtcDay(value: Date) {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

function parseEnglishDateToUtcDay(
  day: string,
  month: string,
  year: string,
): number | null {
  const monthIndex = MONTH_INDEX_BY_NAME.get(month.toLowerCase());
  if (monthIndex === undefined) {
    return null;
  }

  return Date.UTC(Number(year), monthIndex, Number(day));
}

function extractEnglishDateDays(text: string): number[] {
  const days = new Set<number>();
  const dayMonthYear =
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi;
  const monthDayYear =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi;

  for (const match of text.matchAll(dayMonthYear)) {
    const day = parseEnglishDateToUtcDay(match[1]!, match[2]!, match[3]!);
    if (day !== null) {
      days.add(day);
    }
  }

  for (const match of text.matchAll(monthDayYear)) {
    const day = parseEnglishDateToUtcDay(match[2]!, match[1]!, match[3]!);
    if (day !== null) {
      days.add(day);
    }
  }

  return Array.from(days);
}

function blockContainsDate(blockHtml: string, kickoffDate: string): boolean {
  const kickoffDay = toUtcDay(new Date(`${kickoffDate}T00:00:00Z`));
  if (!Number.isFinite(kickoffDay)) {
    return false;
  }

  const $ = load(blockHtml);
  const blockDays = extractEnglishDateDays($.text());
  const oneDay = 24 * 60 * 60 * 1000;

  return blockDays.some(
    (blockDay) => Math.abs(blockDay - kickoffDay) <= oneDay,
  );
}

export function findEventBlockByTeams(
  html: string,
  homeTeamName: string,
  awayTeamName: string,
  kickoffDate: string,
): string | null {
  const $ = load(html);
  const blocks: string[] = [];

  $(".vevent").each((_, element) => {
    const block = $.html(element);
    if (block) {
      blocks.push(block);
    }
  });

  const strictCandidates = blocks.filter(
    (block) =>
      block.includes(`${homeTeamName} national rugby union team`) &&
      block.includes(`${awayTeamName} national rugby union team`),
  );

  if (strictCandidates.length === 1) {
    return strictCandidates[0] ?? null;
  }

  if (strictCandidates.length > 1) {
    const strictDateMatches = strictCandidates.filter((block) =>
      blockContainsDate(block, kickoffDate),
    );
    return strictDateMatches.length === 1
      ? (strictDateMatches[0] ?? null)
      : null;
  }

  const looseCandidateBlocks = blocks.filter(
    (block) => !block.includes(" national rugby union team"),
  );
  const looseCandidates = looseCandidateBlocks.filter(
    (block) => block.includes(homeTeamName) && block.includes(awayTeamName),
  );

  if (looseCandidates.length === 1) {
    return looseCandidates[0] ?? null;
  }

  const dateMatches = looseCandidates.filter((block) =>
    blockContainsDate(block, kickoffDate),
  );

  return dateMatches.length === 1 ? (dateMatches[0] ?? null) : null;
}
