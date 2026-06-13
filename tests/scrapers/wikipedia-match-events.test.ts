import { describe, expect, it } from "vitest";

// Matches the actual structure of Wikipedia Six Nations season page vevent blocks.
// Bold inline labels (Try:, Con:, Pen:, etc.) separate event type sections per team cell.
const MATCH_EVENTS_HTML = `
  <div class="vevent summary" id="Home_v_Away">
    <table style="float:left;width:15%;table-layout:fixed">
      <tbody><tr><td>1 February 2025<br>20:00 CET</td></tr></tbody>
    </table>
    <table style="float:left;width:61%;table-layout:fixed;text-align:center">
      <tbody>
        <tr style="vertical-align:top;font-weight:bold">
          <td class="vcard" style="width:39%;text-align:right">Home Team</td>
          <td style="width:22%">43–0</td>
          <td class="vcard" style="width:39%;text-align:left">Away Team</td>
        </tr>
        <tr style="font-size:85%;vertical-align:top">
          <td style="text-align:right">
            <b>Try:</b> <a>Player A</a> (2) 23', 45'<br>
            Penalty try (pen) 68'<br>
            <b>Con:</b> <a>Player B</a> (3/3) 24', 46', 69'<br>
            <b>Yellow card:</b> <a>Player E</a> 56'
          </td>
          <td><a rel="nofollow" href="#">Report</a></td>
          <td style="text-align:left">
            <b>Con:</b> <a>Player C</a> 13'<br>
            <b>Pen:</b> <a>Player C</a> (3) 8', 52', 65'<br>
            <b>Drop goal:</b> <a>Player D</a> 44'<br>
            <b>Red card:</b> <a>Player F</a>
          </td>
        </tr>
      </tbody>
    </table>
    <table style="float:left;width:24%;table-layout:fixed">
      <tbody><tr><td>Venue</td></tr></tbody>
    </table>
    <div style="clear:both"></div>
  </div>
`;

const URC_HOME_CELL_HTML = `
  <b>Try:</b> <a>le Roux</a> 3' c<br>
  <a>Moodie</a> 14' c<br>
  <a>Jooste</a> 23' m<br>
  <a>Petersen</a> 30' c<br>
  <a>Papier</a> 49' c<br>
  <a>Smith</a> 62' c<br>
  <a>Grobbler</a> 69' c<br>
  <a>Rudolph</a> 77' c<br>
  <b>Con:</b> le Roux (7/8) 4', 15', 31', 50', 63', 70', 78'
`;

const URC_AWAY_CELL_HTML = `
  <b>Try:</b> <a>Fischetti</a> 20' c<br>
  <a>Volpi</a> 58' c<br>
  <a>Di Bartolomeo</a> 73' m<br>
  <b>Con:</b> Roger (2/3) 21', 60'
`;

function impliedScore(events: Array<{ type: string }>) {
  const pointsByType: Record<string, number> = {
    conversion: 2,
    drop_goal: 3,
    penalty_goal: 3,
    try: 5,
  };

  return events.reduce(
    (sum, event) => sum + (pointsByType[event.type] ?? 0),
    0,
  );
}

describe("wikipedia match events scraper", () => {
  it("parses scoring rows and expands multiple minutes", async () => {
    const { parseMatchEventsFromVeventHtml } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );
    const result = parseMatchEventsFromVeventHtml(MATCH_EVENTS_HTML);

    expect(result).toHaveLength(13);
    expect(result.slice(0, 3)).toEqual([
      {
        type: "try",
        minute: 23,
        teamSide: "home",
        playerName: "Player A",
        isPenaltyTry: false,
      },
      {
        type: "try",
        minute: 45,
        teamSide: "home",
        playerName: "Player A",
        isPenaltyTry: false,
      },
      {
        type: "try",
        minute: 68,
        teamSide: "home",
        playerName: "Penalty try",
        isPenaltyTry: true,
      },
    ]);
    expect(result).toContainEqual({
      type: "red_card",
      minute: null,
      teamSide: "away",
      playerName: "Player F",
      isPenaltyTry: false,
    });
  });

  it("parses URC detail rows from td[1] and td[3]", async () => {
    const { parseMatchEventsFromUrcDetailRowHtml } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );

    const result = parseMatchEventsFromUrcDetailRowHtml(`
      <tr style="font-size:85%">
        <td>18:00</td>
        <td><b>Try:</b> <a>Home Player</a> 23'<br><b>Pen:</b> <a>Home Kicker</a> 40'</td>
        <td>Report</td>
        <td><b>Con:</b> <a>Away Kicker</a> 24'</td>
        <td>Attendance</td>
      </tr>
    `);

    expect(result).toEqual([
      {
        isPenaltyTry: false,
        minute: 23,
        playerName: "Home Player",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 40,
        playerName: "Home Kicker",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 24,
        playerName: "Away Kicker",
        teamSide: "away",
        type: "conversion",
      },
    ]);
  });

  it("parses URC aggregated kicker sections from td[1] and td[3]", async () => {
    const { parseMatchEventsFromUrcDetailRowHtml } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );

    const result = parseMatchEventsFromUrcDetailRowHtml(`
      <tr style="font-size:85%">
        <td>18:00</td>
        <td>${URC_HOME_CELL_HTML}</td>
        <td>Report</td>
        <td>${URC_AWAY_CELL_HTML}</td>
        <td>Attendance</td>
      </tr>
    `);
    const homeEvents = result.filter((event) => event.teamSide === "home");
    const awayEvents = result.filter((event) => event.teamSide === "away");
    const homeConversions = homeEvents.filter(
      (event) => event.type === "conversion",
    );
    const homeSuccessfulTrySuffixes = [
      ...URC_HOME_CELL_HTML.matchAll(/\d+'\s*c\b/g),
    ];

    expect(homeEvents.filter((event) => event.type === "try")).toHaveLength(8);
    expect(homeConversions).toHaveLength(7);
    expect(homeConversions.map((event) => event.minute)).toEqual([
      4, 15, 31, 50, 63, 70, 78,
    ]);
    expect(homeConversions).toHaveLength(homeSuccessfulTrySuffixes.length);
    expect(impliedScore(homeEvents)).toBe(54);

    expect(awayEvents.filter((event) => event.type === "try")).toHaveLength(3);
    expect(awayEvents.filter((event) => event.type === "conversion")).toEqual([
      {
        isPenaltyTry: false,
        minute: 21,
        playerName: "Roger",
        teamSide: "away",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 60,
        playerName: "Roger",
        teamSide: "away",
        type: "conversion",
      },
    ]);
    expect(impliedScore(awayEvents)).toBe(19);
  });

  it("parses aggregated penalty goal minute variants without requiring made-attempt ratios", async () => {
    const { parseMatchEventsFromUrcDetailRowHtml } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );

    const result = parseMatchEventsFromUrcDetailRowHtml(`
      <tr style="font-size:85%">
        <td>18:00</td>
        <td>
          <b>Pen:</b> Feinberg-Mngomezulu 5', 43'<br>
          <b>Pen:</b> Doak (3) 5', 25', 43'<br>
          <b>Pen:</b> Naughton (74')<br>
          <b>Pen:</b> Sheedy 70'
        </td>
        <td>Report</td>
        <td></td>
        <td>Attendance</td>
      </tr>
    `);

    expect(result).toEqual([
      {
        isPenaltyTry: false,
        minute: 5,
        playerName: "Feinberg-Mngomezulu",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 43,
        playerName: "Feinberg-Mngomezulu",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 5,
        playerName: "Doak",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 25,
        playerName: "Doak",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 43,
        playerName: "Doak",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 74,
        playerName: "Naughton",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 70,
        playerName: "Sheedy",
        teamSide: "home",
        type: "penalty_goal",
      },
    ]);
  });

  it("parses URC live raw tables with detail scoring in td[1] and td[3]", async () => {
    const { parseMatchEventsFromUrcDetailRowHtml } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );

    const result = parseMatchEventsFromUrcDetailRowHtml(`
      <table class="wikitable mw-collapsible mw-collapsed">
        <tbody>
          <tr>
            <td>21 February 2026</td>
            <td><a>Bulls</a></td>
            <td>54–19</td>
            <td><a>Zebre Parma</a></td>
            <td>Loftus Versfeld</td>
          </tr>
          <tr style="font-size:85%">
            <td>16:00</td>
            <td>${URC_HOME_CELL_HTML}</td>
            <td>Report</td>
            <td>${URC_AWAY_CELL_HTML}</td>
            <td>12,000</td>
          </tr>
        </tbody>
      </table>
    `);

    expect(result.filter((event) => event.teamSide === "home")).toHaveLength(
      15,
    );
    expect(result.filter((event) => event.teamSide === "away")).toHaveLength(5);
  });

  it("parses Top 14 season vevent scoring rows", async () => {
    const { parseMatchEventsFromVeventHtml } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );

    const result = parseMatchEventsFromVeventHtml(`
      <div class="vevent summary">
        <table><tbody><tr><td>14 June 2025<br>18:00</td></tr></tbody></table>
        <table>
          <tbody>
            <tr style="vertical-align:top;font-weight:bold">
              <td class="vcard" style="text-align:right">Bayonne</td>
              <td>20–3</td>
              <td class="vcard" style="text-align:left">Clermont</td>
            </tr>
            <tr style="font-size:85%;vertical-align:top">
              <td style="text-align:right"><b>Try:</b> <a>Tuilagi</a> 23'<br><b>Pen:</b> <a>Segonds</a> 40'</td>
              <td>Report</td>
              <td style="text-align:left"><b>Pen:</b> <a>Urdapilleta</a> 8'</td>
            </tr>
          </tbody>
        </table>
      </div>
    `);

    expect(result).toEqual([
      {
        isPenaltyTry: false,
        minute: 23,
        playerName: "Tuilagi",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 40,
        playerName: "Segonds",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 8,
        playerName: "Urdapilleta",
        teamSide: "away",
        type: "penalty_goal",
      },
    ]);
  });
});
