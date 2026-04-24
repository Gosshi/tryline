import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type WikipediaSquadPlayer = {
  team_slug: string;
  name: string;
  position: string | null;
  caps: number | null;
  date_of_birth: string | null;
};

const TEAM_SLUG_BY_NAME: Record<string, string> = {
  england: "england",
  france: "france",
  ireland: "ireland",
  italy: "italy",
  scotland: "scotland",
  wales: "wales",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toTeamSlug(value: string) {
  return TEAM_SLUG_BY_NAME[normalizeWhitespace(value).toLowerCase()] ?? null;
}

function parseCaps(value: string) {
  const matched = normalizeWhitespace(value).match(/\d+/);

  if (!matched) {
    return null;
  }

  return Number(matched[0]);
}

function parseDateOfBirth(value: string) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  const dateText = normalized.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? normalized;
  const parsed = new Date(dateText);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function parseWikipediaSquadsHtml(html: string): WikipediaSquadPlayer[] {
  const $ = load(html);
  const tables = $(".wikitable");

  if (tables.length === 0) {
    return [];
  }

  const parsed: WikipediaSquadPlayer[] = [];
  const dedup = new Set<string>();

  tables.each((_, table) => {
    const $table = $(table);
    const heading =
      $table.prevAll("h2, h3").first().find(".mw-headline").text() ||
      $table.prevAll("h2, h3").first().text();
    const teamSlug = toTeamSlug(heading);

    if (!teamSlug) {
      return;
    }

    $table.find("tr").slice(1).each((__, row) => {
      const cells = $(row).find("td");

      if (cells.length === 0) {
        return;
      }

      const name = normalizeWhitespace(cells.eq(0).find("a").first().text() || cells.eq(0).text());

      if (!name) {
        return;
      }

      const dedupKey = `${teamSlug}:${name.toLowerCase()}`;

      if (dedup.has(dedupKey)) {
        return;
      }

      dedup.add(dedupKey);
      parsed.push({
        team_slug: teamSlug,
        name,
        position: normalizeWhitespace(cells.eq(1).text()) || null,
        caps: parseCaps(cells.eq(2).text()),
        date_of_birth: parseDateOfBirth(cells.eq(3).text()),
      });
    });
  });

  return parsed;
}

export async function scrapeSquads(pageUrl: string): Promise<WikipediaSquadPlayer[]> {
  const response = await fetchWithPolicy(pageUrl);
  const html = await response.text();

  return parseWikipediaSquadsHtml(html);
}
