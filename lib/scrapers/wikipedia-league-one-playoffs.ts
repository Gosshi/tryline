import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type PlayoffMatchRef = {
  awayScore: number | null;
  homeScore: number | null;
  leagueOneMatchId: number;
};

type RugbyboxTemplate = {
  params?: unknown;
  target?: unknown;
};

const LEAGUE_ONE_PLAYOFF_HEADING = "プレーオフトーナメント";
const LEAGUE_ONE_MATCH_PRINT_RE = /league-one\.jp\/match\/(\d+)\/print/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getWt(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value.wt === "string") {
    return value.wt;
  }

  return null;
}

function getTemplateTarget(template: RugbyboxTemplate): string {
  if (typeof template.target === "string") {
    return template.target;
  }

  if (isRecord(template.target) && typeof template.target.wt === "string") {
    return template.target.wt;
  }

  return "";
}

function collectRugbyboxTemplates(
  value: unknown,
  templates: RugbyboxTemplate[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRugbyboxTemplates(item, templates);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (isRecord(value.template)) {
    const template = value.template as RugbyboxTemplate;

    if (/rugbybox/i.test(getTemplateTarget(template))) {
      templates.push(template);
    }
  }

  for (const nested of Object.values(value)) {
    collectRugbyboxTemplates(nested, templates);
  }
}

function parseDataMw(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findPlayoffHeading($: ReturnType<typeof load>) {
  return $("h2, h3, h4")
    .filter((_, element) => {
      const id = normalizeWhitespace($(element).attr("id") ?? "");
      const text = normalizeWhitespace($(element).text());

      return (
        id === LEAGUE_ONE_PLAYOFF_HEADING ||
        text.includes(LEAGUE_ONE_PLAYOFF_HEADING)
      );
    })
    .first();
}

function isSectionBoundary(element: ReturnType<ReturnType<typeof load>>) {
  if (element.is(".mw-heading2")) {
    return true;
  }

  const tagName = element.prop("tagName")?.toLowerCase();

  return tagName === "h2";
}

function getPlayoffSectionHtml($: ReturnType<typeof load>): string {
  const heading = findPlayoffHeading($);

  if (heading.length === 0) {
    return "";
  }

  const container = heading.closest(".mw-heading");
  let cursor = (container.length > 0 ? container : heading).next();
  const chunks: string[] = [];

  while (cursor.length > 0) {
    if (isSectionBoundary(cursor)) {
      break;
    }

    chunks.push($.html(cursor) ?? "");
    cursor = cursor.next();
  }

  return chunks.join("\n");
}

function parseScores(scoreText: string | null): Pick<
  PlayoffMatchRef,
  "awayScore" | "homeScore"
> {
  const match = scoreText?.match(/(\d+)\s*(?:-|–|－|ー|―|−)\s*(\d+)/);

  if (!match) {
    return { awayScore: null, homeScore: null };
  }

  return {
    awayScore: Number(match[2]),
    homeScore: Number(match[1]),
  };
}

function parseTemplate(template: RugbyboxTemplate): PlayoffMatchRef | null {
  const params = isRecord(template.params) ? template.params : {};
  const report = getWt(params.report);
  const matchIdText = report?.match(LEAGUE_ONE_MATCH_PRINT_RE)?.[1];

  if (!matchIdText) {
    return null;
  }

  return {
    leagueOneMatchId: Number(matchIdText),
    ...parseScores(getWt(params.score)),
  };
}

export function parseLeagueOnePlayoffMatchRefsHtml(
  html: string,
): PlayoffMatchRef[] {
  const $ = load(html);
  const sectionHtml = getPlayoffSectionHtml($);

  if (!sectionHtml) {
    return [];
  }

  const section = load(sectionHtml);
  const byMatchId = new Map<number, PlayoffMatchRef>();

  section("[data-mw]").each((_, element) => {
    const dataMw = section(element).attr("data-mw");

    if (!dataMw) {
      return;
    }

    const parsed = parseDataMw(dataMw);

    if (!parsed) {
      return;
    }

    const templates: RugbyboxTemplate[] = [];
    collectRugbyboxTemplates(parsed, templates);

    for (const template of templates) {
      const match = parseTemplate(template);

      if (match) {
        byMatchId.set(match.leagueOneMatchId, match);
      }
    }
  });

  return [...byMatchId.values()];
}

export async function fetchLeagueOnePlayoffMatchRefs(
  season: string,
): Promise<PlayoffMatchRef[]> {
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`League One season must be YYYY-YY: ${season}`);
  }

  const pageTitle = `ジャパンラグビーリーグワン${season}`;
  const url = `https://ja.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
  const response = await fetchWithPolicy(url);

  return parseLeagueOnePlayoffMatchRefsHtml(await response.text());
}