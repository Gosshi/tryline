import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

const MATCH_EVENTS_HTML = `
  <table class="infobox vevent">
    <tbody>
      <tr>
        <th>Tries</th>
        <td>Player A (23', 45'), Penalty try (68') (pen)</td>
        <td>none</td>
      </tr>
      <tr>
        <th>Cons</th>
        <td>Player B (24', 46', 69')</td>
        <td>Player C (13')</td>
      </tr>
      <tr>
        <th>Pens</th>
        <td>—</td>
        <td>Player C (8', 52', 65')</td>
      </tr>
      <tr>
        <th>Drop goals</th>
        <td></td>
        <td>Player D (44')</td>
      </tr>
      <tr>
        <th>Yellow cards</th>
        <td>Player E (56')</td>
        <td>none</td>
      </tr>
      <tr>
        <th>Red cards</th>
        <td>none</td>
        <td>Player F</td>
      </tr>
    </tbody>
  </table>
`;

describe("wikipedia match events scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses scoring rows and expands multiple minutes", async () => {
    const { parseWikipediaMatchEventsHtml } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );
    const result = parseWikipediaMatchEventsHtml(MATCH_EVENTS_HTML);

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

  it("builds encoded Wikipedia URLs with an en dash", async () => {
    const { buildMatchWikipediaUrl } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );
    const url = buildMatchWikipediaUrl({
      year: "2024",
      homeTeamName: "England",
      awayTeamName: "France",
    });

    expect(decodeURIComponent(url)).toBe(
      "https://en.wikipedia.org/wiki/2024_Six_Nations_Championship_–_England_v_France",
    );
  });

  it("uses fetchWithPolicy and returns an empty array on fetch errors", async () => {
    fetcherMock.fetchWithPolicy.mockRejectedValueOnce(new Error("404"));

    const { scrapeMatchEvents } = await import(
      "@/lib/scrapers/wikipedia-match-events"
    );
    const result = await scrapeMatchEvents(
      "https://en.wikipedia.org/wiki/2024_Six_Nations_Championship_%E2%80%93_England_v_France",
    );

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });
});
