import { load } from "cheerio";

export type ParsedMatchEvent = {
  isPenaltyTry: boolean;
  minute: number | null;
  playerName: string;
  teamSide: "home" | "away";
  type:
    | "conversion"
    | "drop_goal"
    | "penalty_goal"
    | "red_card"
    | "try"
    | "yellow_card";
};

type MatchEventType = ParsedMatchEvent["type"];
type TeamSide = ParsedMatchEvent["teamSide"];

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

function parseMinutes(value: string): Array<number | null> {
  const minutes = [...value.matchAll(/(\d{1,3})(?:\+\d{1,2})?\s*'/g)].map(
    (match) => Number(match[1]),
  );
  return minutes.length > 0 ? minutes : [null];
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

  function flush() {
    if (!currentType || !currentPlayer) {
      minutesBuffer = "";
      currentPlayer = null;
      return;
    }

    const isPenaltyTry =
      currentType === "try" && /penalty try/i.test(currentPlayer);
    const playerName = isPenaltyTry
      ? "Penalty try"
      : normalizeWhitespace(currentPlayer);

    if (playerName) {
      for (const minute of parseMinutes(minutesBuffer)) {
        events.push({
          isPenaltyTry,
          minute,
          playerName,
          teamSide,
          type: currentType,
        });
      }
    }

    minutesBuffer = "";
    currentPlayer = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
