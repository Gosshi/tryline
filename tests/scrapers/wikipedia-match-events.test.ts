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
});
