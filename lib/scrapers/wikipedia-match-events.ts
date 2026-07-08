import { load } from "cheerio";

export type ParsedPlayerMatchEvent = {
  isPenaltyTry: boolean;
  minute: number | null;
  playerName: string;
  source?: string;
  teamSide: "home" | "away";
  type:
    | "conversion"
    | "drop_goal"
    | "penalty_goal"
    | "red_card"
    | "try"
    | "yellow_card";
};

export type ParsedSubstitutionMatchEvent = {
  jerseyIn: number;
  jerseyOut: number;
  minute: number | null;
  playerInName: string;
  playerOutName: string;
  source?: string;
  teamSide: "home" | "away";
  type: "substitution";
};

export type ParsedMatchEvent =
  | ParsedPlayerMatchEvent
  | ParsedSubstitutionMatchEvent;

type MatchEventType = ParsedPlayerMatchEvent["type"];
type TeamSide = ParsedPlayerMatchEvent["teamSide"];

// Bold inline labels as they appear in Wikipedia Six Nations season page vevent blocks.
// Each label corresponds to an event type. The key is the label text, lowercased.
const BOLD_LABEL_TO_TYPE: Record<string, MatchEventType> = {
  "con:": "conversion",
  "cons:": "conversion",
  "dg:": "drop_goal",
  "drop goal:": "drop_goal",
  "drop goals:": "drop_goal",
  "drop:": "drop_goal",
  "pen:": "penalty_goal",
  "penalties:": "penalty_goal",
  "penalty:": "penalty_goal",
  "pens:": "penalty_goal",
  "red card:": "red_card",
  "red cards:": "red_card",
  "red:": "red_card",
  "sin bin:": "yellow_card",
  "sin-bin:": "yellow_card",
  "tries:": "try",
  "try:": "try",
  "yellow card:": "yellow_card",
  "yellow cards:": "yellow_card",
  "yellow:": "yellow_card",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const MINUTE_MARKER_RE = /(\d{1,3})(?:\+\d{1,2})?\s*'|(\d{1,3})(?:\+\d{1,2})(?=\s*(?:,|$))/g;

function parseMinutes(value: string): Array<number | null> {
  const minutes = [...value.matchAll(MINUTE_MARKER_RE)].map((match) =>
    Number(match[1] ?? match[2]),
  );
  return minutes.length > 0 ? minutes : [null];
}

function parseMinuteMarkers(value: string) {
  return [...value.matchAll(MINUTE_MARKER_RE)].map((match) => ({
    index: match.index ?? 0,
    minute: Number(match[1] ?? match[2]),
  }));
}

function isAggregatedKickerType(type: MatchEventType | null) {
  return (
    type === "conversion" || type === "drop_goal" || type === "penalty_goal"
  );
}

function parseAggregatedKickerText(value: string) {
  const trimmed = normalizeWhitespace(value);
  const minuteMarkers = parseMinuteMarkers(trimmed);

  if (minuteMarkers.length === 0) {
    return null;
  }

  const firstParenIndex = trimmed.indexOf("(");
  const nameEndIndex =
    firstParenIndex >= 0
      ? Math.min(firstParenIndex, minuteMarkers[0]!.index)
      : minuteMarkers[0]!.index;
  const ratioMatch = trimmed.match(/\(\s*(\d+)\s*\/\s*\d+\s*\)/);
  const madeCount = ratioMatch ? Number(ratioMatch[1]) : null;
  const playerName = normalizeWhitespace(
    nameEndIndex > 0 ? trimmed.slice(0, nameEndIndex) : "",
  );

  return {
    madeCount,
    minutes: minuteMarkers.map((marker) => marker.minute),
    playerName,
  };
}

// Parses the outer HTML of a single scoring <td> cell.
// Players appear as <a> links; "Penalty try" appears as plain text.
// Bold labels separate event type sections; <br> terminates each player entry.
//
// Note: <td> outside a <table> is stripped by HTML parsers; content lands in <body>.
// We iterate $("body").contents() rather than looking for a <td> element.
function parseScoringCell(
  cellHtml: string,
  teamSide: TeamSide,
): ParsedMatchEvent[] {
  const $ = load(cellHtml);
  const events: ParsedMatchEvent[] = [];
  let currentType: MatchEventType | null = null;
  let currentPlayer: string | null = null;
  let minutesBuffer = "";

  function pushPlayerEvents(params: {
    allowEmptyPlayerName?: boolean;
    minutes: Array<number | null>;
    playerName: string;
    type: MatchEventType;
  }) {
    const isPenaltyTry =
      params.type === "try" && /penalty try/i.test(params.playerName);
    const playerName = isPenaltyTry
      ? "Penalty try"
      : normalizeWhitespace(params.playerName);

    if (!playerName && !params.allowEmptyPlayerName) {
      return;
    }

    for (const minute of params.minutes) {
      events.push({
        isPenaltyTry,
        minute,
        playerName,
        teamSide,
        type: params.type,
      });
    }
  }

  function flush() {
    if (!currentType || !currentPlayer) {
      minutesBuffer = "";
      currentPlayer = null;
      return;
    }

    pushPlayerEvents({
      minutes: parseMinutes(minutesBuffer),
      playerName: currentPlayer,
      type: currentType,
    });

    minutesBuffer = "";
    currentPlayer = null;
  }

  function flushAggregatedKickerText(text: string) {
    if (!isAggregatedKickerType(currentType)) {
      return false;
    }

    const aggregate = parseAggregatedKickerText(text);

    if (!aggregate || !currentType) {
      return false;
    }

    if (
      aggregate.madeCount !== null &&
      aggregate.madeCount !== aggregate.minutes.length
    ) {
      console.warn(
        `[wikipedia-match-events] ${currentType} made count (${aggregate.madeCount}) does not match minute count (${aggregate.minutes.length}) for ${aggregate.playerName}`,
      );
    }

    pushPlayerEvents({
      allowEmptyPlayerName: true,
      minutes: aggregate.minutes,
      playerName: aggregate.playerName,
      type: currentType,
    });

    minutesBuffer = "";
    currentPlayer = null;
    return true;
  }

  $("body")
    .contents()
    .each((_, node: any) => {
      if (node.type === "tag") {
        const tag: string = (node.tagName ?? "").toLowerCase();

        if (tag === "b") {
          flush();
          const labelText = normalizeWhitespace($(node).text()).toLowerCase();
          currentType = BOLD_LABEL_TO_TYPE[labelText] ?? null;
        } else if (tag === "a") {
          flush();
          currentPlayer = normalizeWhitespace($(node).text());
        } else if (tag === "br") {
          flush();
        }
      } else if (node.type === "text") {
        const text: string = node.data ?? "";

        if (currentPlayer !== null) {
          minutesBuffer += text;
        } else if (currentType !== null) {
          if (flushAggregatedKickerText(text)) {
            return;
          }

          // "Penalty try" appears as plain text (no <a> tag)
          const trimmed = normalizeWhitespace(text);

          if (/^penalty try/i.test(trimmed)) {
            flush();
            currentPlayer = "Penalty try";
            minutesBuffer = trimmed.slice("Penalty try".length);
          }
        }
      }
    });

  flush();
  return events;
}

// rawHtml is the outer HTML of a div.vevent.summary block from a Wikipedia Six Nations season page.
// The scoring table's detail row (font-size:85%) has td[0]=home scoring, td[2]=away scoring.
export function parseMatchEventsFromVeventHtml(
  rawHtml: string,
): ParsedMatchEvent[] {
  const $ = load(rawHtml);

  const scoringRow = $("tr")
    .filter((_, el) => ($(el).attr("style") ?? "").includes("font-size:85%"))
    .first();

  if (!scoringRow.length) {
    return [];
  }

  const cells = scoringRow.children("td");

  if (cells.length < 3) {
    return [];
  }

  const homeHtml = $.html(cells.eq(0)) ?? "";
  const awayHtml = $.html(cells.eq(2)) ?? "";

  return [
    ...parseScoringCell(homeHtml, "home"),
    ...parseScoringCell(awayHtml, "away"),
  ];
}

// URC season tables use the detail row's td[1] for home scoring and td[3] for away scoring.
export function parseMatchEventsFromUrcDetailRowHtml(
  rowHtml: string,
): ParsedMatchEvent[] {
  const html = /<table[\s>]/i.test(rowHtml)
    ? rowHtml
    : `<table><tbody>${rowHtml}</tbody></table>`;
  const $ = load(html);
  const scoringRow = $("tr")
    .filter((_, el) => ($(el).attr("style") ?? "").includes("font-size:85%"))
    .first();
  const row = scoringRow.length ? scoringRow : $("tr").first();
  const cells = row.children("td");

  if (cells.length < 4) {
    return [];
  }

  const homeHtml = $.html(cells.eq(1)) ?? "";
  const awayHtml = $.html(cells.eq(3)) ?? "";

  return [
    ...parseScoringCell(homeHtml, "home"),
    ...parseScoringCell(awayHtml, "away"),
  ];
}
