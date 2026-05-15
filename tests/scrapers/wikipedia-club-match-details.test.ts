import { describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  parseWikipediaClubMatchDetailsHtml,
  scrapeWikipediaClubMatchDetails,
} from "@/lib/scrapers/wikipedia-club-match-details";

const html = `
<div class="vevent summary" id="Bath_v_Saracens">
  <table><tr><td>1 January 2026</td></tr></table>
  <table>
    <tr><td>Bath</td><td>20-15</td><td>Saracens</td></tr>
    <tr style="font-size:85%">
      <td><b>Try:</b> <a>Will Muir</a> 12'<br><b>Pen:</b> <a>Finn Russell</a> 44'</td>
      <td></td>
      <td><b>Try:</b> <a>Owen Farrell</a> 30'</td>
    </tr>
  </table>
</div>
<table class="wikitable">
  <tr><td></td><td>15</td><td><a>Joe Cokanasiga</a></td></tr>
  <tr><td></td><td>14</td><td><a>Will Muir</a></td></tr>
  <tr><td></td><td>15</td><td><a>Elliot Daly</a></td></tr>
  <tr><td></td><td>14</td><td><a>Owen Farrell</a></td></tr>
</table>
<div class="vevent summary" id="Other_match"></div>
`;

describe("wikipedia club match details scraper", () => {
  it("parses scoring events and adjacent lineups for a club match", () => {
    const result = parseWikipediaClubMatchDetailsHtml(html, {
      eventId: "Bath_v_Saracens",
      url: "https://en.wikipedia.org/wiki/sample",
    });

    expect(result.events).toEqual([
      {
        isPenaltyTry: false,
        minute: 12,
        playerName: "Will Muir",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 44,
        playerName: "Finn Russell",
        teamSide: "home",
        type: "penalty_goal",
      },
      {
        isPenaltyTry: false,
        minute: 30,
        playerName: "Owen Farrell",
        teamSide: "away",
        type: "try",
      },
    ]);
    expect(result.lineup?.home_players).toEqual([
      { jersey_number: 15, name: "Joe Cokanasiga" },
      { jersey_number: 14, name: "Will Muir" },
    ]);
    expect(result.lineup?.away_players).toEqual([
      { jersey_number: 15, name: "Elliot Daly" },
      { jersey_number: 14, name: "Owen Farrell" },
    ]);
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(new Response(html));

    await scrapeWikipediaClubMatchDetails({
      eventId: "Bath_v_Saracens",
      url: "https://en.wikipedia.org/wiki/sample",
    });

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/sample",
    );
  });
});
