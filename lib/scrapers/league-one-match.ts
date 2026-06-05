import { load } from "cheerio";

import { FetchError } from "@/lib/scrapers/errors";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type LeagueOnePlayer = {
  jersey_number: number;
  player_name: string;
  team_side: "home" | "away";
};

type LeagueOneTeamSide = LeagueOnePlayer["team_side"];
type CheerioSelection = ReturnType<ReturnType<typeof load>>;

export type LeagueOneScoringEvent = {
  minute: number | null;
  player_name: string;
  event_type: "try" | "conversion" | "penalty" | "drop_goal";
  team_side: LeagueOneTeamSide;
};

export type LeagueOneSubstitutionEvent = {
  event_type: "substitution";
  jersey_in: number;
  jersey_out: number;
  minute: number | null;
  player_in_name: string;
  player_out_name: string;
  team_side: LeagueOneTeamSide;
};

export type LeagueOneCardEvent = {
  event_type: "yellow_card" | "red_card";
  jersey_number: number;
  minute: number | null;
  player_name: string;
  team_side: LeagueOneTeamSide;
};

export type LeagueOneEvent =
  | LeagueOneScoringEvent
  | LeagueOneSubstitutionEvent
  | LeagueOneCardEvent;

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

const EVENT_TYPE_BY_PRINT_LABEL: Record<
  string,
  LeagueOneScoringEvent["event_type"]
> = {
  DG: "drop_goal",
  G: "conversion",
  PG: "penalty",
  PT: "try",
  T: "try",
};

const CARD_LABEL_BY_PATTERN: Array<{
  pattern: RegExp;
  type: LeagueOneCardEvent["event_type"];
}> = [
  { pattern: /(?:red|レッド)/i, type: "red_card" },
  {
    pattern: /(?:yellow|イエロー|シンビン|sin[-\s]?bin)/i,
    type: "yellow_card",
  },
];

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

function parseHalfLabel(value: string): 1 | 2 | null {
  const normalized = normalizeWhitespace(value);

  if (/^(?:1st|前半)$/i.test(normalized) || /(?:1st|前半)/i.test(normalized)) {
    return 1;
  }

  if (/^(?:2nd|後半)$/i.test(normalized) || /(?:2nd|後半)/i.test(normalized)) {
    return 2;
  }

  return null;
}

function parseEventMinute(value: string, fallbackHalf: 1 | 2 | null) {
  const normalized = normalizeWhitespace(value);
  const half = parseHalfLabel(normalized) ?? fallbackHalf;
  const minuteMatch = normalized.match(/(\d{1,3})(?:min|分)/i);

  if (!minuteMatch || !half) {
    return null;
  }

  return parseTimelineMinute(`${minuteMatch[1]}分`, half);
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

function buildPlayerLookup(players: LeagueOnePlayer[]) {
  const lookup = new Map<string, LeagueOnePlayer>();

  for (const player of players) {
    lookup.set(`${player.team_side}:${player.jersey_number}`, player);
  }

  return lookup;
}

function lookupPlayerByJersey(
  playersBySideAndJersey: Map<string, LeagueOnePlayer>,
  teamSide: LeagueOneTeamSide,
  jerseyNumber: number,
) {
  return playersBySideAndJersey.get(`${teamSide}:${jerseyNumber}`) ?? null;
}

function sideFromText(value: string): LeagueOneTeamSide | null {
  const normalized = normalizeWhitespace(value);

  if (/(?:home|host|ホスト|ホーム)/i.test(normalized)) {
    return "home";
  }

  if (/(?:away|visitor|ビジター|アウェイ)/i.test(normalized)) {
    return "away";
  }

  return null;
}

function sideFromClass(value: string | undefined): LeagueOneTeamSide | null {
  if (!value) {
    return null;
  }

  if (/(?:^|\s)(?:home|host)(?:\s|$)/i.test(value)) {
    return "home";
  }

  if (/(?:^|\s)(?:away|visitor)(?:\s|$)/i.test(value)) {
    return "away";
  }

  return null;
}

function inferTeamSide(params: {
  cellIndex: number;
  element: CheerioSelection;
  headers: string[];
  jerseyNumbers: number[];
  playersBySideAndJersey: Map<string, LeagueOnePlayer>;
  rowText: string;
}) {
  const { cellIndex, element, headers, jerseyNumbers, playersBySideAndJersey } =
    params;

  for (const ancestor of [
    element,
    element.closest(".team, .home, .away, .host, .visitor"),
    element.closest("table"),
    element.closest("section, div"),
  ]) {
    const side = sideFromClass(ancestor.attr("class"));

    if (side) {
      return side;
    }
  }

  const headerSide = sideFromText(headers[cellIndex] ?? "");

  if (headerSide) {
    return headerSide;
  }

  const rowSide = sideFromText(params.rowText);

  if (rowSide) {
    return rowSide;
  }

  const matchingSides: LeagueOneTeamSide[] = (["home", "away"] as const).filter(
    (side) =>
      jerseyNumbers.every((jerseyNumber) =>
        playersBySideAndJersey.has(`${side}:${jerseyNumber}`),
      ),
  );

  return matchingSides.length === 1 ? matchingSides[0] : null;
}

function extractSubstitutionJerseys(value: string) {
  const match = normalizeWhitespace(value).match(
    /(?:#|No\.?\s*)?(\d{1,2})\s*(?:→|⇒|->|－>|―>|-)\s*(?:#|No\.?\s*)?(\d{1,2})/i,
  );

  if (!match) {
    return null;
  }

  return {
    jerseyIn: Number(match[2]),
    jerseyOut: Number(match[1]),
  };
}

function parseSubstitutionEvents(
  $: ReturnType<typeof load>,
  players: LeagueOnePlayer[],
) {
  const events: LeagueOneSubstitutionEvent[] = [];
  const playersBySideAndJersey = buildPlayerLookup(players);

  $("table")
    .filter((_, table) => $(table).closest("#score, #team").length === 0)
    .each((_, table) => {
      const rows = $(table).find("tr");
      let currentHalf: 1 | 2 | null = null;
      let headers: string[] = [];

      rows.each((__, row) => {
        const rowElement = $(row);
        const cells = rowElement.children("th, td");
        const rowText = normalizeWhitespace(rowElement.text());
        const rowHalf = parseHalfLabel(rowText);

        if (rowHalf) {
          currentHalf = rowHalf;
        }

        if (cells.length === 0) {
          return;
        }

        if (cells.first().is("th")) {
          headers = cells
            .map((___, cell) => normalizeWhitespace($(cell).text()))
            .get();
        }

        const minute = parseEventMinute(rowText, currentHalf);

        if (minute === null) {
          return;
        }

        cells.each((cellIndex, cell) => {
          const cellElement = $(cell);
          const jerseys = extractSubstitutionJerseys(cellElement.text());

          if (!jerseys) {
            return;
          }

          const teamSide = inferTeamSide({
            cellIndex,
            element: cellElement,
            headers,
            jerseyNumbers: [jerseys.jerseyOut, jerseys.jerseyIn],
            playersBySideAndJersey,
            rowText,
          });

          if (!teamSide) {
            console.warn(
              "[league-one-match] skipping substitution without team side",
              {
                row: rowText,
              },
            );
            return;
          }

          const playerOut = lookupPlayerByJersey(
            playersBySideAndJersey,
            teamSide,
            jerseys.jerseyOut,
          );
          const playerIn = lookupPlayerByJersey(
            playersBySideAndJersey,
            teamSide,
            jerseys.jerseyIn,
          );

          if (!playerOut || !playerIn) {
            console.warn(
              "[league-one-match] skipping substitution without lineup match",
              {
                jersey_in: jerseys.jerseyIn,
                jersey_out: jerseys.jerseyOut,
                row: rowText,
                team_side: teamSide,
              },
            );
            return;
          }

          events.push({
            event_type: "substitution",
            jersey_in: jerseys.jerseyIn,
            jersey_out: jerseys.jerseyOut,
            minute,
            player_in_name: playerIn.player_name,
            player_out_name: playerOut.player_name,
            team_side: teamSide,
          });
        });
      });
    });

  return events;
}

function resolveCardType(
  value: string,
): LeagueOneCardEvent["event_type"] | null {
  const normalized = normalizeWhitespace(value);

  return (
    CARD_LABEL_BY_PATTERN.find(({ pattern }) => pattern.test(normalized))
      ?.type ?? null
  );
}

function extractCardJerseyNumber(value: string) {
  const withoutMinute = normalizeWhitespace(value).replace(
    /(?:前半|後半|1st|2nd)?\s*\d{1,3}(?:min|分)/gi,
    "",
  );
  const match = withoutMinute.match(/(?:#|No\.?\s*)?(\d{1,2})(?!\d)/i);

  return match ? Number(match[1]) : null;
}

function parseCardEvents(
  $: ReturnType<typeof load>,
  players: LeagueOnePlayer[],
) {
  const events: LeagueOneCardEvent[] = [];
  const playersBySideAndJersey = buildPlayerLookup(players);
  const seenEventKeys = new Set<string>();

  $("table")
    .filter((_, table) => $(table).closest("#score, #team").length === 0)
    .each((_, table) => {
      const rows = $(table).find("tr");
      let currentHalf: 1 | 2 | null = null;
      let headers: string[] = [];

      rows.each((__, row) => {
        const rowElement = $(row);
        const cells = rowElement.children("th, td");
        const rowText = normalizeWhitespace(rowElement.text());
        const rowHalf = parseHalfLabel(rowText);

        if (rowHalf) {
          currentHalf = rowHalf;
        }

        if (cells.length === 0) {
          return;
        }

        if (cells.first().is("th")) {
          headers = cells
            .map((___, cell) => normalizeWhitespace($(cell).text()))
            .get();
        }

        const cardType = resolveCardType(rowText);
        const minute = parseEventMinute(rowText, currentHalf);

        if (!cardType || minute === null) {
          return;
        }

        const cardLabelCells = cells.filter((___, cell) => {
          const text = normalizeWhitespace($(cell).text());
          return resolveCardType(text) !== null;
        });
        const jerseyCells = cells.filter((___, cell) => {
          const text = normalizeWhitespace($(cell).text());
          return extractCardJerseyNumber(text) !== null;
        });
        const targetCells =
          cardLabelCells.length > 0
            ? cardLabelCells
            : jerseyCells.length > 0
              ? jerseyCells
              : cells;

        targetCells.each((cellIndex, cell) => {
          const cellElement = $(cell);
          const jerseyNumber =
            extractCardJerseyNumber(cellElement.text()) ??
            extractCardJerseyNumber(rowText);

          if (jerseyNumber === null) {
            return;
          }

          const teamSide = inferTeamSide({
            cellIndex,
            element: cellElement,
            headers,
            jerseyNumbers: [jerseyNumber],
            playersBySideAndJersey,
            rowText,
          });

          if (!teamSide) {
            console.warn("[league-one-match] skipping card without team side", {
              row: rowText,
            });
            return;
          }

          const player = lookupPlayerByJersey(
            playersBySideAndJersey,
            teamSide,
            jerseyNumber,
          );

          if (!player) {
            console.warn(
              "[league-one-match] skipping card without lineup match",
              {
                jersey_number: jerseyNumber,
                row: rowText,
                team_side: teamSide,
              },
            );
            return;
          }

          const eventKey = `${cardType}:${minute}:${teamSide}:${jerseyNumber}`;

          if (seenEventKeys.has(eventKey)) {
            return;
          }

          seenEventKeys.add(eventKey);
          events.push({
            event_type: cardType,
            jersey_number: jerseyNumber,
            minute,
            player_name: player.player_name,
            team_side: teamSide,
          });
        });
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
  const events = [
    ...parseScoringEvents($),
    ...parseSubstitutionEvents($, players),
    ...parseCardEvents($, players),
  ];

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
