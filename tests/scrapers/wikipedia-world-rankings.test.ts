import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

const rankingsHtml = `
  <table class="wikitable">
    <tr><th>Rank</th><th>Change</th><th>Team</th><th>Points</th></tr>
    <tr><td>1</td><td>—</td><td><span class="flagicon"><a><img /></a></span><a href="/wiki/South_Africa_national_rugby_union_team">South Africa</a></td><td>92.78</td></tr>
    <tr><td>2</td><td>—</td><td><a href="/wiki/New_Zealand_national_rugby_union_team">New Zealand</a></td><td>90.12</td></tr>
    <tr><td>3</td><td>+1</td><td>France</td><td>88.50</td></tr>
  </table>
`;

describe("wikipedia world rankings scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses rank, team, and points columns from the rankings table", async () => {
    const { parseWorldRugbyRankingsHtml } = await import(
      "@/lib/scrapers/wikipedia-world-rankings"
    );

    expect(parseWorldRugbyRankingsHtml(rankingsHtml)).toEqual([
      { points: 92.78, rank: 1, teamName: "South Africa" },
      { points: 90.12, rank: 2, teamName: "New Zealand" },
      { points: 88.5, rank: 3, teamName: "France" },
    ]);
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response(rankingsHtml, { status: 200 }),
    );
    const { scrapeWorldRugbyRankings, WORLD_RUGBY_RANKINGS_URL } = await import(
      "@/lib/scrapers/wikipedia-world-rankings"
    );

    await scrapeWorldRugbyRankings();

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(
      WORLD_RUGBY_RANKINGS_URL,
    );
  });
});
