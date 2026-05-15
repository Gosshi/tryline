import { describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  parseWikipediaRcMatchDetailsHtml,
  scrapeWikipediaRcMatchDetails,
} from "@/lib/scrapers/wikipedia-rc-match-details";

const html = `
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<p>16 August 2025</p>
<table>
  <tr>
    <td><a>South Africa</a></td>
    <td>22–38</td>
    <td><a>Australia</a></td>
  </tr>
  <tr>
    <td>Try: Siya Kolisi (4', 23'), Cheslin Kolbe (45')</td>
    <td></td>
    <td>Con: Noah Lolesio (5', 24') Pen: Noah Lolesio (55')</td>
  </tr>
</table>
<table>
  <tr>
    <td><a>Ox Nche</a></td><td>LP</td><td><a>Angus Bell</a></td>
  </tr>
  <tr>
    <td><a>Malcolm Marx</a></td><td>HK</td><td><a>Matt Faessler</a></td>
  </tr>
  <tr>
    <td><a>Thomas du Toit</a></td><td>TP</td><td><a>Taniela Tupou</a></td>
  </tr>
</table>
`;

describe("Wikipedia Rugby Championship match details scraper", () => {
  it("parses scoring events and lineup rows from a synthetic event id", () => {
    const result = parseWikipediaRcMatchDetailsHtml(html, {
      eventId: "Round_1_0",
      url: "https://en.wikipedia.org/wiki/2025_Rugby_Championship",
    });

    expect(result.events).toEqual([
      {
        isPenaltyTry: false,
        minute: 4,
        playerName: "Siya Kolisi",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 23,
        playerName: "Siya Kolisi",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 45,
        playerName: "Cheslin Kolbe",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 5,
        playerName: "Noah Lolesio",
        teamSide: "away",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 24,
        playerName: "Noah Lolesio",
        teamSide: "away",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 55,
        playerName: "Noah Lolesio",
        teamSide: "away",
        type: "penalty_goal",
      },
    ]);
    expect(result.lineup?.home_players).toEqual([
      { jersey_number: 1, name: "Ox Nche" },
      { jersey_number: 2, name: "Malcolm Marx" },
      { jersey_number: 3, name: "Thomas du Toit" },
    ]);
    expect(result.lineup?.away_players).toEqual([
      { jersey_number: 1, name: "Angus Bell" },
      { jersey_number: 2, name: "Matt Faessler" },
      { jersey_number: 3, name: "Taniela Tupou" },
    ]);
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(new Response(html));

    await scrapeWikipediaRcMatchDetails({
      eventId: "Round_1_0",
      url: "https://en.wikipedia.org/wiki/2025_Rugby_Championship",
    });

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/2025_Rugby_Championship",
    );
  });
});
