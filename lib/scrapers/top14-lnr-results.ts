import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type Top14LnrMatchResult = {
  away_score: number | null;
  away_team_slug: string;
  kickoff_at: string;
  home_score: number | null;
  home_team_slug: string;
  lnr_id: string;
  lnr_match_path: string;
  round: number;
  round_slug: string;
  season: string;
  source_url: string;
  status: "finished" | "scheduled";
  venue: string | null;
};

export type Top14LnrCalendarParseResult = {
  matches: Top14LnrMatchResult[];
  unknownTeamNames: string[];
};

const TOP14_ORIGIN = "https://top14.lnr.fr";
const FRENCH_MONTHS: Record<string, number> = {
  aout: 7,
  avril: 3,
  decembre: 11,
  fevrier: 1,
  janvier: 0,
  juillet: 6,
  juin: 5,
  mai: 4,
  mars: 2,
  novembre: 10,
  octobre: 9,
  septembre: 8,
};

export const TOP14_TEAM_SLUG_BY_LNR_NAME: Record<string, string> = {
  "ASM Clermont": "clermont",
  "Aviron Bayonnais": "bayonne",
  "Castres Olympique": "castres",
  "LOU Rugby": "lyon",
  "Montpellier Hérault Rugby": "montpellier",
  "RC Toulon": "toulon",
  "RC Vannes": "vannes",
  "Racing 92": "racing-92",
  "Section Paloise": "pau",
  "Stade Français Paris": "stade-francais",
  "Stade Rochelais": "la-rochelle",
  "Stade Toulousain": "toulouse",
  "USA Perpignan": "perpignan",
  "Union Bordeaux-Bègles": "bordeaux-begles",
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeFrenchText(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function toLnrSeason(season: string) {
  const short = season.match(/^(\d{4})-(\d{2})$/);

  if (!short) {
    throw new Error(`Top 14 season must be YYYY-YY: ${season}`);
  }

  return `${short[1]}-20${short[2]}`;
}

export function buildTop14RegularSeasonRoundSlugs() {
  return Array.from({ length: 26 }, (_, index) => `j${index + 1}`);
}

export function buildTop14LnrCalendarUrl(season: string, roundSlug: string) {
  return `${TOP14_ORIGIN}/calendrier-et-resultats/${toLnrSeason(season)}/${roundSlug}`;
}

export function buildTop14LnrCurrentCalendarUrl(season: string) {
  return `${TOP14_ORIGIN}/calendrier-et-resultats/${toLnrSeason(season)}`;
}

function parseRoundFromSlug(roundSlug: string) {
  const matched = roundSlug.match(/^j(\d{1,2})$/i);

  if (!matched) {
    throw new Error(
      `Unsupported Top 14 regular-season round slug: ${roundSlug}`,
    );
  }

  return Number(matched[1]);
}

function parseMatchPath(pathname: string) {
  const match = pathname.match(
    /^\/feuille-de-match\/([^/]+)\/(j\d{1,2})\/(\d+)(?:-.+)?$/,
  );

  if (!match) {
    return null;
  }

  return {
    id: match[3]!,
    roundSlug: match[2]!,
    season: match[1]!,
  };
}

export function parseTop14LnrCurrentRoundSlug(params: {
  html: string;
  season: string;
}) {
  const $ = load(params.html);
  const lnrSeason = toLnrSeason(params.season);

  for (const href of $("a[href*='/feuille-de-match/']")
    .toArray()
    .map((link) => $(link).attr("href"))) {
    if (!href) {
      continue;
    }

    const pathname = new URL(href, TOP14_ORIGIN).pathname;
    const match = pathname.match(
      new RegExp(`^/feuille-de-match/${lnrSeason}/([^/]+)/`),
    );

    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error(
    `Unable to determine the current Top 14 round for ${params.season}.`,
  );
}

function getParisDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    year: Number(parts.year),
  };
}

function toEuropeParisUtcIso(params: {
  day: number;
  hour: number;
  minute: number;
  monthIndex: number;
  year: number;
}) {
  const targetAsUtc = Date.UTC(
    params.year,
    params.monthIndex,
    params.day,
    params.hour,
    params.minute,
  );
  let instant = targetAsUtc;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const paris = getParisDateParts(new Date(instant));
    const parisAsUtc = Date.UTC(
      paris.year,
      paris.month - 1,
      paris.day,
      paris.hour,
      paris.minute,
    );
    instant += targetAsUtc - parisAsUtc;
  }

  return new Date(instant).toISOString();
}

function parseDateParts(dateText: string, lnrSeason: string) {
  const normalized = normalizeFrenchText(dateText);
  const french = normalized.match(
    /(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/,
  );
  const numeric = normalized.match(/(\d{1,2})[./-](\d{1,2})/);
  const [startYearText, endYearText] = lnrSeason.split("-");

  if (!startYearText || !endYearText) {
    return null;
  }

  const day = Number(french?.[1] ?? numeric?.[1]);
  const monthIndex = french
    ? FRENCH_MONTHS[french[2]!]
    : Number(numeric?.[2]) - 1;

  if (!Number.isInteger(day) || monthIndex === undefined || monthIndex < 0) {
    return null;
  }

  return {
    day,
    monthIndex,
    year: monthIndex >= 7 ? Number(startYearText) : Number(endYearText),
  };
}

export function parseTop14LnrKickoffAt(params: {
  dateText: string;
  lnrSeason: string;
  timeText: string;
}) {
  const date = parseDateParts(params.dateText, params.lnrSeason);
  const time = normalizeFrenchText(params.timeText).match(/^(\d{1,2})h(\d{2})$/);

  if (!date || !time) {
    return null;
  }

  return toEuropeParisUtcIso({
    ...date,
    hour: Number(time[1]),
    minute: Number(time[2]),
  });
}

function parseScore(node: ReturnType<ReturnType<typeof load>>) {
  const scoreText = normalizeText(
    node
      .find(".match-line__score, .score, .scoreboard, [data-score]")
      .first()
      .text(),
  );
  const match = scoreText.match(/(\d+)\s*[–-]\s*(\d+)/);

  if (!match) {
    return { awayScore: null, homeScore: null, status: "scheduled" as const };
  }

  return {
    awayScore: Number(match[2]),
    homeScore: Number(match[1]),
    status: "finished" as const,
  };
}

function findFixtureDateContext(
  $: ReturnType<typeof load>,
  element: Parameters<ReturnType<typeof load>>[0],
) {
  return (
    normalizeText(
      $(element)
        .closest(".calendar-results__line")
        .prevAll(".calendar-results__fixture-date")
        .first()
        .text(),
    ) || null
  );
}

export function parseTop14LnrCalendarHtmlWithDiagnostics(params: {
  html: string;
  roundSlug: string;
  season: string;
  sourceUrl: string;
}): Top14LnrCalendarParseResult {
  const $ = load(params.html);
  const matches = new Map<string, Top14LnrMatchResult>();
  const unknownTeamNames = new Set<string>();
  const expectedLnrSeason = toLnrSeason(params.season);

  $(".match-calendar-line").each((_, element) => {
    const line = $(element);
    const matchLink = line
      .find("a[href*='/feuille-de-match/']")
      .first()
      .attr("href");

    if (!matchLink) {
      return;
    }

    const url = new URL(matchLink, TOP14_ORIGIN);
    const parsedPath = parseMatchPath(url.pathname);

    if (
      !parsedPath ||
      parsedPath.roundSlug !== params.roundSlug ||
      parsedPath.season !== expectedLnrSeason
    ) {
      return;
    }

    const teamNames = line
      .find(".club-line__name")
      .toArray()
      .map((team) => normalizeText($(team).text()))
      .filter(Boolean);

    if (teamNames.length !== 2) {
      return;
    }

    const [homeTeamName, awayTeamName] = teamNames;
    const homeTeamSlug = TOP14_TEAM_SLUG_BY_LNR_NAME[homeTeamName!];
    const awayTeamSlug = TOP14_TEAM_SLUG_BY_LNR_NAME[awayTeamName!];

    if (!homeTeamSlug || !awayTeamSlug) {
      if (!homeTeamSlug) unknownTeamNames.add(homeTeamName!);
      if (!awayTeamSlug) unknownTeamNames.add(awayTeamName!);
      return;
    }

    const dateText = findFixtureDateContext($, element);
    const kickoffAt = dateText
      ? parseTop14LnrKickoffAt({
          dateText,
          lnrSeason: expectedLnrSeason,
          timeText: line.find(".match-line__time").first().text(),
        })
      : null;

    if (!kickoffAt) {
      return;
    }

    const score = parseScore(line);

    matches.set(parsedPath.id, {
      away_score: score.awayScore,
      away_team_slug: awayTeamSlug,
      home_score: score.homeScore,
      home_team_slug: homeTeamSlug,
      kickoff_at: kickoffAt,
      lnr_id: parsedPath.id,
      lnr_match_path: url.pathname,
      round: parseRoundFromSlug(parsedPath.roundSlug),
      round_slug: parsedPath.roundSlug,
      season: params.season,
      source_url: params.sourceUrl,
      status: score.status,
      venue: null,
    });
  });

  return {
    matches: [...matches.values()].sort((left, right) =>
      left.kickoff_at.localeCompare(right.kickoff_at),
    ),
    unknownTeamNames: [...unknownTeamNames].sort(),
  };
}

export function parseTop14LnrCalendarHtml(params: {
  html: string;
  roundSlug: string;
  season: string;
  sourceUrl: string;
}): Top14LnrMatchResult[] {
  return parseTop14LnrCalendarHtmlWithDiagnostics(params).matches;
}

export async function fetchTop14LnrRoundResultsWithDiagnostics(
  season: string,
  roundSlug: string,
): Promise<Top14LnrCalendarParseResult> {
  const sourceUrl = buildTop14LnrCalendarUrl(season, roundSlug);
  const response = await fetchWithPolicy(sourceUrl);

  return parseTop14LnrCalendarHtmlWithDiagnostics({
    html: await response.text(),
    roundSlug,
    season,
    sourceUrl,
  });
}

export async function fetchTop14LnrCurrentRoundSlug(season: string) {
  const response = await fetchWithPolicy(buildTop14LnrCurrentCalendarUrl(season));

  return parseTop14LnrCurrentRoundSlug({
    html: await response.text(),
    season,
  });
}

export async function fetchTop14LnrRoundResults(
  season: string,
  roundSlug: string,
): Promise<Top14LnrMatchResult[]> {
  return (await fetchTop14LnrRoundResultsWithDiagnostics(season, roundSlug))
    .matches;
}

export async function fetchTop14LnrRegularSeasonResults(season: string) {
  const results: Top14LnrMatchResult[] = [];

  for (const roundSlug of buildTop14RegularSeasonRoundSlugs()) {
    results.push(...(await fetchTop14LnrRoundResults(season, roundSlug)));
  }

  return results.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
}
