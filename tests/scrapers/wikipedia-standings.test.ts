import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

const standingsHtml = `
  <table class="wikitable">
    <tbody>
      <tr>
        <th>Pos</th><th>Team</th><th>Pld</th><th>W</th><th>D</th><th>L</th>
        <th>PF</th><th>PA</th><th>+/-</th><th>Try BP</th><th>LBP</th><th>Pts</th>
      </tr>
      <tr><td>1</td><th><a href="/wiki/Ireland">Ireland</a></th><td>3</td><td>3</td><td>0</td><td>0</td><td>92</td><td>51</td><td>+41</td><td>2</td><td>0</td><td>14</td></tr>
      <tr><td>2</td><th><a href="/wiki/France">France</a></th><td>3</td><td>2</td><td>0</td><td>1</td><td>88</td><td>62</td><td>+26</td><td>1</td><td>1</td><td>10</td></tr>
      <tr><td>3</td><th>England</th><td>3</td><td>2</td><td>0</td><td>1</td><td>61</td><td>58</td><td>+3</td><td>0</td><td>1</td><td>9</td></tr>
      <tr><td>4</td><th>Scotland</th><td>3</td><td>1</td><td>0</td><td>2</td><td>70</td><td>73</td><td>-3</td><td>1</td><td>1</td><td>6</td></tr>
      <tr><td>5</td><th>Wales</th><td>3</td><td>1</td><td>0</td><td>2</td><td>48</td><td>84</td><td>-36</td><td>0</td><td>0</td><td>4</td></tr>
      <tr><td>6</td><th>Italy</th><td>3</td><td>0</td><td>0</td><td>3</td><td>45</td><td>76</td><td>-31</td><td>0</td><td>1</td><td>1</td></tr>
    </tbody>
  </table>
`;

describe("wikipedia standings scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses standings rows using dynamic header indexes", async () => {
    const { parseCompetitionStandingsHtml } =
      await import("@/lib/scrapers/wikipedia-standings");
    const result = parseCompetitionStandingsHtml(standingsHtml);

    expect(result).toHaveLength(6);
    expect(result[0]).toMatchObject({
      position: 1,
      teamName: "Ireland",
      played: 3,
      won: 3,
      drawn: 0,
      lost: 0,
      pointsFor: 92,
      pointsAgainst: 51,
      triesFor: 0,
      bonusPointsTry: 2,
      bonusPointsLosing: 0,
      totalPoints: 14,
    });
  });

  it("skips rows with non-numeric values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseCompetitionStandingsHtml } =
      await import("@/lib/scrapers/wikipedia-standings");
    const result = parseCompetitionStandingsHtml(
      standingsHtml.replace("<td>3</td><td>3</td>", "<td>TBD</td><td>3</td>"),
    );

    expect(result).toHaveLength(5);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response(standingsHtml, { status: 200 }),
    );

    const { scrapeCompetitionStandings } =
      await import("@/lib/scrapers/wikipedia-standings");
    await scrapeCompetitionStandings(
      "https://en.wikipedia.org/wiki/2027_Six_Nations_Championship",
    );

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);
  });
});
