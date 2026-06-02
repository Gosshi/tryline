import { describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  parseWikipediaUrcMatchDetailsHtml,
  scrapeWikipediaUrcMatchDetails,
} from "@/lib/scrapers/wikipedia-urc-match-details";

const html = `
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<table class="mw-collapsible mw-collapsed">
  <tbody>
    <tr>
      <td>26 September 2025</td>
      <td style="text-align:right"><b><a>Stormers</a></b></td>
      <td style="text-align:center"><b>35 – 0</b></td>
      <td style="text-align:left"><b><a>Leinster</a></b></td>
      <td>Cape Town Stadium</td>
    </tr>
    <tr style="font-size:85%">
      <td>18:00</td>
      <td>
        <b>Try:</b> <a>Ungerer</a> 45' c<br/>
        <a>Roos</a> (2) 63' c 68' c<br/>
        <b>Con:</b> <a>Matthee</a> (3/4) 45' 64' 69'<br/>
        <b>Pen:</b> <a>Matthee</a> (3/5) 7' 33' 42'<br/>
      </td>
      <td>Report / Highlights</td>
      <td>
        <b>Try:</b> <a>Osborne</a> 12'<br/>
        <b>Cards:</b> <a>Deegan</a> 63'<br/>
      </td>
      <td>Attendance: 13,529 Referee: ...</td>
    </tr>
  </tbody>
</table>
`;

const multiMatchHtml = `
<div class="mw-heading mw-heading3"><h3 id="Round_17">Round 17</h3></div>
<table class="mw-collapsible mw-collapsed">
  <tbody>
    <tr>
      <td>24 April 2026</td>
      <td style="text-align:right"><b><a>Munster</a></b></td>
      <td style="text-align:center"><b>19 – 10</b></td>
      <td style="text-align:left"><b><a>Scarlets</a></b></td>
      <td>Thomond Park</td>
    </tr>
    <tr style="font-size:85%">
      <td>19:35</td>
      <td><b>Try:</b> <a>Kilcoyne</a> 8'</td>
      <td>Report</td>
      <td><b>Pen:</b> <a>Costelow</a> 15'</td>
      <td>Attendance</td>
    </tr>
  </tbody>
</table>
<table class="mw-collapsible mw-collapsed">
  <tbody>
    <tr>
      <td>25 April 2026</td>
      <td style="text-align:right"><b><a>Glasgow Warriors</a></b></td>
      <td style="text-align:center"><b>28 – 21</b></td>
      <td style="text-align:left"><b><a>Cardiff</a></b></td>
      <td>Scotstoun Stadium</td>
    </tr>
    <tr style="font-size:85%">
      <td>19:35</td>
      <td>
        <b>Try:</b> <a>Steyn</a> 11' c<br/>
        <b>Con:</b> <a>Horne</a> 12'<br/>
        <b>Pen:</b> <a>Horne</a> 40'<br/>
      </td>
      <td>Report</td>
      <td>
        <b>Try:</b> <a>Belcher</a> 54' c<br/>
        <b>Con:</b> <a>de Beer</a> 55'<br/>
      </td>
      <td>Attendance</td>
    </tr>
  </tbody>
</table>
`;

describe("Wikipedia URC match details scraper", () => {
  it("parses scoring events from the synthetic event id detail row", () => {
    const result = parseWikipediaUrcMatchDetailsHtml(html, {
      eventId: "Round_1_0",
      url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
    });

    expect(result.lineup).toBeNull();
    expect(result.events).toEqual([
      {
        isPenaltyTry: false,
        minute: 45,
        playerName: "Ungerer",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 63,
        playerName: "Roos",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 68,
        playerName: "Roos",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 45,
        playerName: "Matthee",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 64,
        playerName: "Matthee",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 69,
        playerName: "Matthee",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 7,
        playerName: "Matthee",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 33,
        playerName: "Matthee",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 42,
        playerName: "Matthee",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 12,
        playerName: "Osborne",
        teamSide: "away",
        type: "try",
      },
    ]);
  });

  it("selects the matching detail row from team-name event ids", () => {
    const result = parseWikipediaUrcMatchDetailsHtml(multiMatchHtml, {
      eventId: "Round_17_Glasgow_Warriors_v_Cardiff",
      url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
    });

    expect(result.events).toEqual([
      {
        isPenaltyTry: false,
        minute: 11,
        playerName: "Steyn",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 12,
        playerName: "Horne",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 40,
        playerName: "Horne",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 54,
        playerName: "Belcher",
        teamSide: "away",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 55,
        playerName: "de Beer",
        teamSide: "away",
        type: "conversion",
      },
    ]);
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(new Response(html));

    await scrapeWikipediaUrcMatchDetails({
      eventId: "Round_1_0",
      url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
    });

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
    );
  });
});
