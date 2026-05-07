import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type LeagueOneScheduleEntry = {
  league_one_match_id: number;
  round: number;
  kickoff_at: string;
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  match_url: string;
};

export const TEAM_SLUG_BY_LEAGUE_ONE_NAME: Record<string, string> = {
  "Black Rams Tokyo": "ricoh-black-rams",
  "BlackRams Tokyo": "ricoh-black-rams",
  "Canon Eagles": "canon-eagles",
  "Honda Heat": "honda-heat",
  "Kobelco Kobe Steelers": "kobelco-kobe-steelers",
  "Kubota Spears": "kubota-spears",
  "Kubota Spears Funabashi Tokyo-Bay": "kubota-spears",
  "Kubota Spears S Tokyo-Bay": "kubota-spears",
  "Mie Honda Heat": "honda-heat",
  "Mitsubishi Sagamihara DynaBoars": "mitsubishi-dynaboars",
  "Mitsubishi Sagamihara Dynaboars": "mitsubishi-dynaboars",
  "Ricoh BlackRamsTokyo": "ricoh-black-rams",
  "Saitama Wild Knights": "saitama-wild-knights",
  "Shizuoka Blue Revs": "shizuoka-blue-revs",
  "Shizuoka BlueRevs": "shizuoka-blue-revs",
  "Tokyo Suntory Sungoliath": "tokyo-suntory-sungoliath",
  "Tokyo Sungoliath": "tokyo-suntory-sungoliath",
  "Toshiba Brave Lupus Tokyo": "toshiba-brave-lupus",
  "Toyota Verblitz": "toyota-verblitz",
  "Urayasu D-Rocks": "urayasu-d-rocks",
  "Yokohama Canon Eagles": "canon-eagles",
};

const LEAGUE_ONE_BASE_URL = "https://league-one.jp";
const JST_OFFSET_HOURS = 9;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

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
  const normalized = normalizeTeamName(teamName);
  const slug = TEAM_SLUG_BY_NORMALIZED_NAME[normalized];

  if (!slug) {
    throw new Error(`Unknown League One team name: ${teamName}`);
  }

  return slug;
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

  if (!match) {
    throw new Error(`Unable to parse League One round: ${title}`);
  }

  return Number(match[1]);
}

function parseScore(value: string) {
  const parsed = Number(normalizeWhitespace(value));

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLeagueOneScheduleHtml(
  html: string,
  season: string,
): LeagueOneScheduleEntry[] {
  const $ = load(html);
  const entries: LeagueOneScheduleEntry[] = [];

  $(".c-schedule").each((_, element) => {
    const card = $(element);
    const title = normalizeWhitespace(card.find(".ttl-wrap .ttl").text());

    if (!/\bDIVISION\s*1\b/i.test(title)) {
      return;
    }

    const detailLink = card.find('a.btn-match-detail[href*="/en/match/"]').first();
    const href = detailLink.attr("href") ?? "";
    const idMatch = href.match(/\/en\/match\/(\d+)/);
    const detailText = normalizeWhitespace(detailLink.text());

    if (!idMatch || !/Full-Time/i.test(detailText)) {
      return;
    }

    const home = card.find(".game .home").first();
    const away = card.find(".game .away").first();
    const homeScore = parseScore(home.find(".score").first().text());
    const awayScore = parseScore(away.find(".score").first().text());

    if (homeScore === null || awayScore === null) {
      return;
    }

    const leagueOneMatchId = Number(idMatch[1]);
    const matchUrl = `${LEAGUE_ONE_BASE_URL}/en/match/${leagueOneMatchId}`;

    entries.push({
      away_score: awayScore,
      away_team_slug: resolveTeamSlug(away.find(".name.only-pc").first().text()),
      home_score: homeScore,
      home_team_slug: resolveTeamSlug(home.find(".name.only-pc").first().text()),
      kickoff_at: parseKickoffAt({
        dateText: card.find(".datetime .date").first().text(),
        season,
        timeText: card.find(".datetime .time").first().text(),
      }),
      league_one_match_id: leagueOneMatchId,
      match_url: matchUrl,
      round: parseRound(title),
      venue:
        normalizeWhitespace(card.find(".ttl-wrap .place").first().text()) ||
        null,
    });
  });

  return entries.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
}

export async function fetchLeagueOneSchedule(
  season: string,
): Promise<LeagueOneScheduleEntry[]> {
  const url = buildScheduleUrl(season);
  const response = await fetchWithPolicy(url);
  const html = await response.text();
  const entries = parseLeagueOneScheduleHtml(html, season);

  if (entries.length === 0) {
    throw new Error(`No finished League One D1 matches found for ${season}.`);
  }

  return entries;
}
