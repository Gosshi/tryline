import { load } from "cheerio";

import { FetchError } from "@/lib/scrapers/errors";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type LeagueOnePlayer = {
  jersey_number: number;
  player_name: string;
  team_side: "home" | "away";
};

export type LeagueOneEvent = {
  minute: number | null;
  player_name: string;
  event_type: "try" | "conversion" | "penalty" | "drop_goal";
  team_side: "home" | "away";
};

export type LeagueOneMatchDetail = {
  players: LeagueOnePlayer[];
  events: LeagueOneEvent[];
  sourceUrl: string;
};

type ScoreState = {
  home: number;
  away: number;
};

const LEAGUE_ONE_BASE_URL = "https://league-one.jp";
const JAPANESE_NAME_CHAR_PATTERN =
  /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])\s+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])/gu;

const EVENT_TYPE_BY_PRINT_LABEL: Record<string, LeagueOneEvent["event_type"]> =
  {
    DG: "drop_goal",
    G: "conversion",
    PG: "penalty",
    PT: "try",
    T: "try",
  };

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanPlayerName(value: string) {
  return normalizeWhitespace(
    value
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\s+$/, ""),
  )
    .replace(/\s*・\s*/g, "・")
    .replace(JAPANESE_NAME_CHAR_PATTERN, "$1$2");
}

function parseLineupPlayers(
  $: ReturnType<typeof load>,
  selector: string,
  teamSide: LeagueOnePlayer["team_side"],
) {
  const players: LeagueOnePlayer[] = [];

  $(`#team ${selector} table tr`).each((_, row) => {
    const cells = $(row).children("td");

    if (cells.length < 2) {
      return;
    }

    const jerseyNumber = Number(normalizeWhitespace(cells.eq(0).text()));
    const playerName = cleanPlayerName(cells.eq(1).text());

    if (!Number.isInteger(jerseyNumber) || !playerName) {
      return;
    }

    players.push({
      jersey_number: jerseyNumber,
      player_name: playerName,
      team_side: teamSide,
    });
  });

  return players;
}

function parseMatchPageLineupPlayers(
  $: ReturnType<typeof load>,
  selector: string,
  teamSide: LeagueOnePlayer["team_side"],
) {
  const players: LeagueOnePlayer[] = [];

  $(`ol.match-member-${selector} li`).each((_, row) => {
    const item = $(row);
    const jerseyNumber = Number(item.attr("id")?.match(/\d+/)?.[0] ?? "");
    const nameNode = item.find("a").first().clone();

    nameNode.find(".player-info").remove();

    const playerName = cleanPlayerName(nameNode.text());

    if (!Number.isInteger(jerseyNumber) || !playerName) {
      return;
    }

    players.push({
      jersey_number: jerseyNumber,
      player_name: playerName,
      team_side: teamSide,
    });
  });

  return players;
}

function parseTimelineMinute(value: string, half: 1 | 2): number | null {
  const match = normalizeWhitespace(value).match(/^(\d{1,3})(?:min|分)$/i);

  if (!match) {
    return null;
  }

  const minute = Number(match[1]);

  if (!Number.isFinite(minute)) {
    return null;
  }

  return half === 2 ? minute + 40 : minute;
}

function parsePlayerName(value: string) {
  const withoutNumber = normalizeWhitespace(value).replace(/^\d+\./, "");

  return cleanPlayerName(withoutNumber);
}

function parseScore(value: string) {
  const parsed = Number(normalizeWhitespace(value));

  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTeamSide(previous: ScoreState, next: ScoreState) {
  if (next.home > previous.home && next.away === previous.away) {
    return "home";
  }

  if (next.away > previous.away && next.home === previous.home) {
    return "away";
  }

  return null;
}

function parseScoringEvents($: ReturnType<typeof load>) {
  const events: LeagueOneEvent[] = [];
  let currentHalf: 1 | 2 = 1;
  const score: ScoreState = { away: 0, home: 0 };

  $("#score table tr").each((_, row) => {
    const cells = $(row).children();

    if (cells.first().is("th")) {
      const halfText = normalizeWhitespace(cells.first().text());
      currentHalf = /^(?:2nd|後半)$/i.test(halfText) ? 2 : 1;
      return;
    }

    const typeLabel = normalizeWhitespace(cells.eq(3).text()).replace(
      /x$/i,
      "",
    );
    const eventType = EVENT_TYPE_BY_PRINT_LABEL[typeLabel];

    if (!eventType) {
      return;
    }

    const nextHomeScore = parseScore(cells.eq(4).text());
    const nextAwayScore = parseScore(cells.eq(6).text());

    if (nextHomeScore === null || nextAwayScore === null) {
      return;
    }

    const teamSide = resolveTeamSide(score, {
      away: nextAwayScore,
      home: nextHomeScore,
    });

    score.home = nextHomeScore;
    score.away = nextAwayScore;

    if (!teamSide) {
      return;
    }

    events.push({
      event_type: eventType,
      minute: parseTimelineMinute(cells.eq(0).text(), currentHalf),
      player_name:
        eventType === "try" && typeLabel === "PT"
          ? "Penalty try"
          : parsePlayerName(cells.eq(2).text()),
      team_side: teamSide,
    });
  });

  return events;
}

export function parseLeagueOneMatchPrintHtml(
  html: string,
  sourceUrl = `${LEAGUE_ONE_BASE_URL}/match/unknown/print`,
): LeagueOneMatchDetail {
  const $ = load(html);
  const players = [
    ...parseLineupPlayers($, ".team.home", "home"),
    ...parseLineupPlayers($, ".team.away", "away"),
  ];
  const events = parseScoringEvents($);

  return { events, players, sourceUrl };
}

export function parseLeagueOneMatchPageHtml(
  html: string,
  sourceUrl = `${LEAGUE_ONE_BASE_URL}/match/unknown?t1=1`,
): LeagueOneMatchDetail {
  const $ = load(html);
  const players = [
    ...parseMatchPageLineupPlayers($, "left", "home"),
    ...parseMatchPageLineupPlayers($, "right", "away"),
  ];

  return { events: [], players, sourceUrl };
}

export async function fetchLeagueOneMatchDetail(
  matchId: number,
  options: { allowEmptyLineups?: boolean } = {},
): Promise<LeagueOneMatchDetail> {
  const printUrl = `${LEAGUE_ONE_BASE_URL}/match/${matchId}/print`;
  const matchPageUrl = `${LEAGUE_ONE_BASE_URL}/match/${matchId}?t1=1`;
  let detail: LeagueOneMatchDetail | null = null;

  try {
    const response = await fetchWithPolicy(printUrl);
    const html = await response.text();
    detail = parseLeagueOneMatchPrintHtml(html, printUrl);
  } catch (error) {
    if (!(error instanceof FetchError) || error.status !== 404) {
      throw error;
    }
  }

  if (!detail || detail.players.length === 0) {
    try {
      const response = await fetchWithPolicy(matchPageUrl);
      const html = await response.text();
      detail = parseLeagueOneMatchPageHtml(html, matchPageUrl);
    } catch (error) {
      if (
        options.allowEmptyLineups &&
        error instanceof FetchError &&
        error.status === 404
      ) {
        return { events: [], players: [], sourceUrl: matchPageUrl };
      }

      throw error;
    }
  }

  if (detail.players.length === 0 && !options.allowEmptyLineups) {
    throw new Error(`No League One lineups found for match ${matchId}.`);
  }

  return detail;
}
