import { load } from "cheerio";

import { normalizeWhitespace } from "@/lib/ingestion/sources/live-source-utils";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { TEAM_SLUG_BY_LEAGUE_ONE_NAME } from "@/lib/scrapers/league-one-schedule";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const LEAGUE_ONE_BASE_URL = "https://league-one.jp";
const JST_OFFSET_HOURS = 9;

function normalizeTeamName(value: string) {
  return normalizeWhitespace(value)
    .replace(/\b(BL TOKYO|BR TOKYO|KOBE S|MIE H|SAGAMIHARA DB)\b/gi, "")
    .replace(/\b(SHIZUOKA BR|TOKYO SG|TOYOTA V|URAYASU DR)\b/gi, "")
    .replace(/\b(SAITAMA WK|YOKOHAMA E)\b/gi, "")
    .trim()
    .toLowerCase();
}

const TEAM_SLUG_BY_NORMALIZED_NAME = Object.fromEntries(
  Object.entries(TEAM_SLUG_BY_LEAGUE_ONE_NAME).map(([name, slug]) => [
    normalizeTeamName(name),
    slug,
  ]),
);

function parseSeason(season: string) {
  const match = season.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    throw new Error(`League One season must be YYYY-YY: ${season}`);
  }

  return {
    endYear: Number(`20${match[2]}`),
    startYear: Number(match[1]),
  };
}

function buildScheduleUrl(season: string) {
  const { startYear } = parseSeason(season);

  return `${LEAGUE_ONE_BASE_URL}/en/schedule/?t1=3&year=${startYear}`;
}

function resolveTeamSlug(teamName: string) {
  return TEAM_SLUG_BY_NORMALIZED_NAME[normalizeTeamName(teamName)] ?? null;
}

function parseKickoffAt(params: {
  dateText: string;
  season: string;
  timeText: string;
}) {
  const { endYear, startYear } = parseSeason(params.season);
  const dateMatch = normalizeWhitespace(params.dateText).match(
    /^(\d{1,2})\.(\d{1,2})/,
  );
  const timeMatch = normalizeWhitespace(params.timeText).match(
    /^(\d{1,2}):(\d{2})$/,
  );

  if (!dateMatch || !timeMatch) {
    throw new Error(
      `Unable to parse League One kickoff: ${params.dateText} ${params.timeText}`,
    );
  }

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const year = month >= 7 ? startYear : endYear;

  return new Date(
    Date.UTC(year, month - 1, day, hour - JST_OFFSET_HOURS, minute),
  ).toISOString();
}

function parseRound(title: string) {
  const match = title.match(/\bR(\d{1,2})\b/i);

  return match?.[1] ? Number(match[1]) : null;
}

function parseScore(value: string) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function slugEventPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseLeagueOneLiveHtml(
  html: string,
  season: string,
): ParsedLiveMatch[] {
  const $ = load(html);
  const entries: ParsedLiveMatch[] = [];

  $(".c-schedule").each((_, element) => {
    const card = $(element);
    const title = normalizeWhitespace(card.find(".ttl-wrap .ttl").text());

    if (!/\bDIVISION\s*1\b/i.test(title)) {
      return;
    }

    const detailLink = card.find('a.btn-match-detail[href*="/en/match/"]').first();
    const href = detailLink.attr("href") ?? "";
    const idMatch = href.match(/\/en\/match\/(\d+)/);
    const home = card.find(".game .home").first();
    const away = card.find(".game .away").first();
    const homeTeamName = normalizeWhitespace(
      home.find(".name.only-pc").first().text(),
    );
    const awayTeamName = normalizeWhitespace(
      away.find(".name.only-pc").first().text(),
    );
    const homeTeamSlug = resolveTeamSlug(homeTeamName);
    const awayTeamSlug = resolveTeamSlug(awayTeamName);

    if (!homeTeamName || !awayTeamName || !homeTeamSlug || !awayTeamSlug) {
      return;
    }

    const homeScore = parseScore(home.find(".score").first().text());
    const awayScore = parseScore(away.find(".score").first().text());
    const round = parseRound(title);
    const eventId = idMatch
      ? `match_${idMatch[1]}`
      : `${round ?? "round"}_${slugEventPart(homeTeamName)}_v_${slugEventPart(awayTeamName)}`;

    entries.push({
      awayScore,
      awayTeamName,
      awayTeamSlug,
      eventId,
      homeScore,
      homeTeamName,
      homeTeamSlug,
      kickoffAt: parseKickoffAt({
        dateText: card.find(".datetime .date").first().text(),
        season,
        timeText: card.find(".datetime .time").first().text(),
      }),
      lineupTableHtml: null,
      rawHtml: "",
      round,
      status:
        homeScore === null || awayScore === null ? "scheduled" : "finished",
      venue:
        normalizeWhitespace(card.find(".ttl-wrap .place").first().text()) ||
        null,
    });
  });

  return entries.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
}

export async function fetchLeagueOne202425(): Promise<ParsedLiveMatch[]> {
  const season = "2024-25";
  const response = await fetchWithPolicy(buildScheduleUrl(season));

  return parseLeagueOneLiveHtml(await response.text(), season);
}
