import { describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  parseWikipediaRwcMatchEventsHtml,
  scrapeWikipediaRwcMatchEvents,
} from "@/lib/scrapers/wikipedia-rwc-match-events";

const HEADING_HTML = `
  <div class="mw-heading mw-heading3"><h3 id="South_Africa_vs_Ireland">South Africa vs Ireland</h3></div>
  <div class="vevent summary">
    <table style="float:left;width:15%"><tbody><tr><td>23 September 2023<br>21:00 CEST</td></tr></tbody></table>
    <table style="float:left;width:61%">
      <tbody>
        <tr style="vertical-align:top;font-weight:bold">
          <td class="vcard" style="text-align:right">South Africa</td>
          <td>8–13</td>
          <td class="vcard" style="text-align:left">Ireland</td>
        </tr>
        <tr style="font-size:85%;vertical-align:top">
          <td style="text-align:right"><b>Try:</b> <a>Kolbe</a> 51'<br><b>Pen:</b> <a>Libbok</a> 6'</td>
          <td><a>Report</a></td>
          <td style="text-align:left"><b>Try:</b> <a>Hansen</a> 33'<br><b>Con:</b> <a>Sexton</a> 35'<br><b>Pen:</b> <a>Sexton</a> 59'<br><b>Pen:</b> <a>Crowley</a> 77'</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

const SINGLE_VEVENT_HTML = `
  <div class="vevent summary">
    <table style="float:left;width:15%"><tbody><tr><td>28 October 2023<br>21:00 CEST</td></tr></tbody></table>
    <table style="float:left;width:61%">
      <tbody>
        <tr style="vertical-align:top;font-weight:bold">
          <td class="vcard" style="text-align:right">New Zealand</td>
          <td>11–12</td>
          <td class="vcard" style="text-align:left">South Africa</td>
        </tr>
        <tr style="font-size:85%;vertical-align:top">
          <td style="text-align:right"><b>Try:</b> <a>Barrett</a> 6'<br><b>Pen:</b> <a>Mo'unga</a> 31', 53'</td>
          <td><a>Report</a></td>
          <td style="text-align:left"><b>Pen:</b> <a>Pollard</a> 2', 34', 49', 81'</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

describe("wikipedia RWC match events scraper", () => {
  it("parses events from the vevent following a matching heading id", () => {
    const result = parseWikipediaRwcMatchEventsHtml(HEADING_HTML, {
      eventId: "South_Africa_vs_Ireland",
      url: "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_B",
    });

    expect(result.lineup).toBeNull();
    expect(result.events).toEqual([
      {
        isPenaltyTry: false,
        minute: 51,
        playerName: "Kolbe",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 6,
        playerName: "Libbok",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 33,
        playerName: "Hansen",
        teamSide: "away",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 35,
        playerName: "Sexton",
        teamSide: "away",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 59,
        playerName: "Sexton",
        teamSide: "away",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 77,
        playerName: "Crowley",
        teamSide: "away",
        type: "penalty_goal",
      },
    ]);
  });

  it("falls back to the first vevent when eventId is null", () => {
    const result = parseWikipediaRwcMatchEventsHtml(SINGLE_VEVENT_HTML, {
      eventId: null,
      url: "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_final",
    });

    expect(result.events).toEqual([
      {
        isPenaltyTry: false,
        minute: 6,
        playerName: "Barrett",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 31,
        playerName: "Mo'unga",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 53,
        playerName: "Mo'unga",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 2,
        playerName: "Pollard",
        teamSide: "away",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 34,
        playerName: "Pollard",
        teamSide: "away",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 49,
        playerName: "Pollard",
        teamSide: "away",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 81,
        playerName: "Pollard",
        teamSide: "away",
        type: "penalty_goal",
      },
    ]);
  });

  it("returns empty events when no scoring section is present", () => {
    expect(
      parseWikipediaRwcMatchEventsHtml("<div><p>No score details</p></div>", {
        eventId: "Missing",
        url: "https://example.test/missing",
      }),
    ).toEqual({
      events: [],
      lineup: null,
    });
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(new Response(HEADING_HTML));

    await scrapeWikipediaRwcMatchEvents({
      eventId: "South_Africa_vs_Ireland",
      url: "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_B",
    });

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_B",
    );
  });
});
