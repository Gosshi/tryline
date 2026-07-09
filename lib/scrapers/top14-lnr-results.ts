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
const LNR_TEAM_TO_TRYLINE_SLUG: Record<string, string> = {
  "asm-clermont-auvergne": "clermont",
  "aviron-bayonnais": "bayonne",
  bayonne: "bayonne",
  "bordeaux-begles": "bordeaux-begles",
  castres: "castres",
  "castres-olympique": "castres",
  clermont: "clermont",
  "la-rochelle": "la-rochelle",
  "lyon-ou": "lyon",
  lyon: "lyon",
  montpellier: "montpellier",
  "montpellier-herault-rugby": "montpellier",
  montauban: "us-montauban",
  paris: "stade-francais",
  pau: "pau",
  perpignan: "perpignan",
  racing: "racing-92",
  "racing-92": "racing-92",
  "rc-toulon": "toulon",
  "rc-vannes": "vannes",
  "section-paloise": "pau",
  "stade-francais": "stade-francais",
  "stade-francais-paris": "stade-francais",
  "stade-rochelais": "la-rochelle",
  "stade-toulousain": "toulouse",
  toulon: "toulon",
  toulouse: "toulouse",
  "union-bordeaux-begles": "bordeaux-begles",
  "usa-perpignan": "perpignan",
  vannes: "vannes",
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function parseRoundFromSlug(roundSlug: string) {
  const matched = roundSlug.match(/^j(\d{1,2})$/i);

  if (!matched) {
    throw new Error(
      `Unsupported Top 14 regular-season round slug: ${roundSlug}`,
    );
  }

  return Number(matched[1]);
}

function parsePath(pathname: string) {
  const match = pathname.match(
    /^\/feuille-de-match\/([^/]+)\/(j\d{1,2})\/(\d+)-(.+)$/,
  );

  if (!match) {
    return null;
  }

  return {
    id: match[3]!,
    roundSlug: match[2]!,
    season: match[1]!,
    slugPart: match[4]!,
  };
}

function resolveTrylineTeamSlug(lnrSlug: string) {
  return LNR_TEAM_TO_TRYLINE_SLUG[normalizeSlug(lnrSlug)] ?? null;
}

export function resolveTop14TeamsFromLnrSlug(slugPart: string) {
  const normalized = normalizeSlug(slugPart);
  const lnrSlugs = Object.keys(LNR_TEAM_TO_TRYLINE_SLUG).sort(
    (left, right) => right.length - left.length,
  );

  for (const homeLnrSlug of lnrSlugs) {
    const prefix = `${homeLnrSlug}-`;

    if (!normalized.startsWith(prefix)) {
      continue;
    }

    const awayLnrSlug = normalized.slice(prefix.length);
    const homeSlug = resolveTrylineTeamSlug(homeLnrSlug);
    const awaySlug = resolveTrylineTeamSlug(awayLnrSlug);

    if (homeSlug && awaySlug) {
      return { awaySlug, homeSlug };
    }
  }

  throw new Error(`Unknown Top 14 LNR team slug pair: ${slugPart}`);
}

function tryResolveTop14TeamsFromLnrSlug(slugPart: string) {
  try {
    return resolveTop14TeamsFromLnrSlug(slugPart);
  } catch {
    return null;
  }
}

function lastSundayOfMonthUtc(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());

  return date;
}

function isCentralEuropeanSummerTime(date: Date) {
  const year = date.getUTCFullYear();
  const startsAt = lastSundayOfMonthUtc(year, 2);
  startsAt.setUTCHours(1, 0, 0, 0);

  const endsAt = lastSundayOfMonthUtc(year, 9);
  endsAt.setUTCHours(1, 0, 0, 0);

  return date >= startsAt && date < endsAt;
}

function buildKickoffIso(params: {
  day: number;
  hours: number;
  minutes: number;
  monthIndex: number;
  year: number;
}) {
  const localDateAsUtc = new Date(
    Date.UTC(
      params.year,
      params.monthIndex,
      params.day,
      params.hours,
      params.minutes,
    ),
  );
  const offset = isCentralEuropeanSummerTime(localDateAsUtc) ? 2 : 1;

  return new Date(
    Date.UTC(
      params.year,
      params.monthIndex,
      params.day,
      params.hours - offset,
      params.minutes,
    ),
  ).toISOString();
}

function parseDatetimeAttribute(value: string) {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseYearFromSeason(monthIndex: number, lnrSeason: string) {
  const [startYearText, endYearText] = lnrSeason.split("-");

  return monthIndex >= 7 ? Number(startYearText) : Number(endYearText);
}

function parseFrenchDateTime(text: string, lnrSeason: string) {
  const normalized = normalizeText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const dateMatch = normalized.match(
    /(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/,
  );
  const timeMatch = normalized.match(/(\d{1,2})[:h](\d{2})/);

  if (!dateMatch) {
    return null;
  }

  const monthIndex = FRENCH_MONTHS[dateMatch[2]!];

  if (monthIndex === undefined) {
    return null;
  }

  const year = dateMatch[3]
    ? Number(dateMatch[3])
    : parseYearFromSeason(monthIndex, lnrSeason);

  if (!timeMatch) {
    return new Date(
      Date.UTC(year, monthIndex, Number(dateMatch[1]), 0, 0),
    ).toISOString();
  }

  return buildKickoffIso({
    day: Number(dateMatch[1]),
    hours: Number(timeMatch[1]),
    minutes: Number(timeMatch[2]),
    monthIndex,
    year,
  });
}

function parseNumericDateTime(text: string, lnrSeason: string) {
  const normalized = normalizeText(text);
  const dateMatch = normalized.match(
    /(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/,
  );
  const timeMatch = normalized.match(/(\d{1,2})[:h](\d{2})/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const month = Number(dateMatch[2]);
  const explicitYear = dateMatch[3];
  const [startYearText, endYearText] = lnrSeason.split("-");
  const year = explicitYear
    ? Number(explicitYear.length === 2 ? `20${explicitYear}` : explicitYear)
    : month >= 7
      ? Number(startYearText)
      : Number(endYearText);

  return buildKickoffIso({
    day: Number(dateMatch[1]),
    hours: Number(timeMatch[1]),
    minutes: Number(timeMatch[2]),
    monthIndex: month - 1,
    year,
  });
}

function parseKickoffAt(
  node: ReturnType<ReturnType<typeof load>>,
  lnrSeason: string,
  dateContext: string | null,
) {
  const datetime =
    node.find("[datetime]").first().attr("datetime") ??
    node.attr("data-kickoff") ??
    node.attr("data-date") ??
    null;

  if (datetime) {
    const parsed = parseDatetimeAttribute(datetime);

    if (parsed) {
      return parsed;
    }
  }

  const text = normalizeText(
    [dateContext, node.text()].filter(Boolean).join(" "),
  );

  return (
    parseFrenchDateTime(text, lnrSeason) ??
    parseNumericDateTime(text, lnrSeason)
  );
}

function parseScore(node: ReturnType<ReturnType<typeof load>>): {
  awayScore: number | null;
  homeScore: number | null;
  status: "finished" | "scheduled";
} {
  const homeScore = node.attr("data-home-score");
  const awayScore = node.attr("data-away-score");

  if (
    homeScore &&
    awayScore &&
    /^\d+$/.test(homeScore) &&
    /^\d+$/.test(awayScore)
  ) {
    return {
      awayScore: Number(awayScore),
      homeScore: Number(homeScore),
      status: "finished",
    };
  }

  const scoreText =
    node.find(".score, .scoreboard, [data-score]").first().text() ||
    node.attr("data-score") ||
    node.text();
  const matched = normalizeText(scoreText).match(/(\d+)\s*[–-]\s*(\d+)/);

  if (!matched) {
    return { awayScore: null, homeScore: null, status: "scheduled" };
  }

  return {
    awayScore: Number(matched[2]),
    homeScore: Number(matched[1]),
    status: "finished",
  };
}

function parseVenue(node: ReturnType<ReturnType<typeof load>>) {
  return (
    normalizeText(
      node.attr("data-venue") ??
        node
          .find(".venue, .stadium, .stade, .lieu, [data-venue]")
          .first()
          .text(),
    ) || null
  );
}

function findFixtureDateContext(
  $: ReturnType<typeof load>,
  element: Parameters<ReturnType<typeof load>>[0],
) {
  const line = $(element).closest(".calendar-results__line");
  const text = normalizeText(
    line.prevAll(".calendar-results__fixture-date").first().text(),
  );

  return text || null;
}

function findMatchContainer(
  $: ReturnType<typeof load>,
  element: Parameters<ReturnType<typeof load>>[0],
) {
  const link = $(element);
  const candidates = [
    link,
    ...link
      .parents()
      .toArray()
      .map((node) => $(node)),
  ];

  return (
    candidates.find((candidate) => {
      const text = normalizeText(candidate.text());
      return (
        candidate.attr("data-kickoff") ||
        candidate.find("[datetime]").length > 0 ||
        /(\d{1,2})[:h](\d{2})/.test(text)
      );
    }) ?? link.parent()
  );
}

export function parseTop14LnrCalendarHtml(params: {
  html: string;
  roundSlug: string;
  season: string;
  sourceUrl: string;
}): Top14LnrMatchResult[] {
  const $ = load(params.html);
  const results = new Map<string, Top14LnrMatchResult>();
  const unknownSlugParts = new Set<string>();
  const expectedLnrSeason = toLnrSeason(params.season);

  $("a[href*='/feuille-de-match/']").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    const url = new URL(href, TOP14_ORIGIN);
    const parsedPath = parsePath(url.pathname);

    if (!parsedPath || parsedPath.roundSlug !== params.roundSlug) {
      return;
    }

    const teams = tryResolveTop14TeamsFromLnrSlug(parsedPath.slugPart);

    if (!teams) {
      unknownSlugParts.add(parsedPath.slugPart);
      return;
    }

    const container = findMatchContainer($, element);
    const dateContext = findFixtureDateContext($, element);
    const kickoffAt = parseKickoffAt(container, parsedPath.season, dateContext);

    if (!kickoffAt) {
      throw new Error(`Unable to parse Top 14 LNR kickoff for ${url.pathname}`);
    }

    const score = parseScore(container);

    results.set(parsedPath.id, {
      away_score: score.awayScore,
      away_team_slug: teams.awaySlug,
      home_score: score.homeScore,
      home_team_slug: teams.homeSlug,
      kickoff_at: kickoffAt,
      lnr_id: parsedPath.id,
      lnr_match_path: url.pathname,
      round: parseRoundFromSlug(parsedPath.roundSlug),
      round_slug: parsedPath.roundSlug,
      season: params.season,
      source_url: params.sourceUrl,
      status: score.status,
      venue: parseVenue(container),
    });
  });

  if (unknownSlugParts.size > 0) {
    throw new Error(
      `Unknown Top 14 LNR team slug pair(s): ${[...unknownSlugParts].join(", ")}`,
    );
  }

  return [...results.values()].filter(
    (match) => toLnrSeason(match.season) === expectedLnrSeason,
  );
}

export async function fetchTop14LnrRoundResults(
  season: string,
  roundSlug: string,
): Promise<Top14LnrMatchResult[]> {
  const sourceUrl = buildTop14LnrCalendarUrl(season, roundSlug);
  const response = await fetchWithPolicy(sourceUrl);

  return parseTop14LnrCalendarHtml({
    html: await response.text(),
    roundSlug,
    season,
    sourceUrl,
  });
}

export async function fetchTop14LnrRegularSeasonResults(season: string) {
  const results: Top14LnrMatchResult[] = [];

  for (const roundSlug of buildTop14RegularSeasonRoundSlugs()) {
    results.push(...(await fetchTop14LnrRoundResults(season, roundSlug)));
  }

  return results.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
}
