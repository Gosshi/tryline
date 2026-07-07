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

  it("parses variable-size tables without separate try and losing bonus columns", async () => {
    const { parseCompetitionStandingsHtml } =
      await import("@/lib/scrapers/wikipedia-standings");
    const result = parseCompetitionStandingsHtml(`
      <table class="wikitable">
        <tr>
          <th>Pos</th><th>Club</th><th>Pld</th><th>W</th><th>D</th><th>L</th>
          <th>PF</th><th>PA</th><th>Pts</th>
        </tr>
        ${Array.from(
          { length: 10 },
          (_, index) => `
            <tr>
              <td>${index + 1}</td><th>Club ${index + 1}</th><td>9</td>
              <td>${9 - index}</td><td>0</td><td>${index}</td>
              <td>${200 - index}</td><td>${100 + index}</td><td>${40 - index}</td>
            </tr>
          `,
        ).join("")}
      </table>
    `);

    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({
      bonusPointsLosing: 0,
      bonusPointsTry: 0,
      teamName: "Club 1",
      triesFor: 0,
    });
  });

  it("parses Spanish League One-style standings headers", async () => {
    const { parseCompetitionStandingsHtml } =
      await import("@/lib/scrapers/wikipedia-standings");
    const result = parseCompetitionStandingsHtml(`
      <table class="wikitable">
        <tr>
          <th>Pos</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>PP</th>
          <th>PF</th><th>PC</th><th>Pts</th>
        </tr>
        <tr>
          <td>1</td><th>Wild Knights</th><td>12</td><td>10</td><td>1</td><td>1</td>
          <td>420</td><td>210</td><td>49</td>
        </tr>
      </table>
    `);

    expect(result).toEqual([
      {
        bonusPointsLosing: 0,
        bonusPointsTry: 0,
        drawn: 1,
        lost: 1,
        played: 12,
        pointsAgainst: 210,
        pointsFor: 420,
        position: 1,
        teamName: "Wild Knights",
        totalPoints: 49,
        triesFor: 0,
        won: 10,
      },
    ]);
  });

  it("uses row order when the standings table has no position header", async () => {
    const { parseCompetitionStandingsHtml } =
      await import("@/lib/scrapers/wikipedia-standings");
    const result = parseCompetitionStandingsHtml(`
      <table class="wikitable">
        <tr>
          <th>Team</th><th>Pld</th><th>W</th><th>D</th><th>L</th>
          <th>PF</th><th>PA</th><th>Pts</th>
        </tr>
        <tr><th>Fiji</th><td>4</td><td>4</td><td>0</td><td>0</td><td>157</td><td>62</td><td>22</td></tr>
        <tr><th>Japan</th><td>4</td><td>3</td><td>0</td><td>1</td><td>193</td><td>93</td><td>14</td></tr>
      </table>
    `);

    expect(result.map((row) => row.position)).toEqual([1, 2]);
  });

  it("strips Wikipedia footnotes from numeric standings cells", async () => {
    const { parseCompetitionStandingsHtml } =
      await import("@/lib/scrapers/wikipedia-standings");
    const result = parseCompetitionStandingsHtml(`
      <table class="wikitable">
        <tr>
          <th>Pos</th><th>Team</th><th>Pld</th><th>W</th><th>D</th><th>L</th>
          <th>PF</th><th>PA</th><th>Pts</th>
        </tr>
        <tr>
          <td>1</td><th><a href="/wiki/Stade_Toulousain">Toulouse</a></th>
          <td>26</td><td>18</td><td>2</td><td>6</td><td>821</td><td>512</td><td>86[a]</td>
        </tr>
      </table>
    `);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      teamName: "Toulouse",
      totalPoints: 86,
    });
  });

  it("parses Super Rugby Pacific standings headers with Wikipedia navbar text", async () => {
    const { parseCompetitionStandingsHtml } =
      await import("@/lib/scrapers/wikipedia-standings");
    const result = parseCompetitionStandingsHtml(`
      <table class="wikitable">
        <tr>
          <th>Pos</th><th>Team v t e</th><th>Pld</th><th>W</th><th>D</th><th>L</th>
          <th>PF</th><th>PA</th><th>PD</th><th>TF</th><th>TA</th><th>TB</th><th>LB</th><th>Pts</th><th>Qualification</th>
        </tr>
        <tr>
          <td>1</td><th><a href="/wiki/Hurricanes_(rugby_union)">Hurricanes</a> (C)</th>
          <td>14</td><td>11</td><td>0</td><td>3</td><td>562</td><td>298</td><td>+264</td>
          <td>86</td><td>44</td><td>9</td><td>2</td><td>55</td><td>Qualifying finals</td>
        </tr>
        <tr>
          <td>2</td><th><a href="/wiki/Chiefs_(rugby_union)">Chiefs</a> (RU)</th>
          <td>14</td><td>11</td><td>0</td><td>3</td><td>515</td><td>325</td><td>+190</td>
          <td>75</td><td>49</td><td>6</td><td>1</td><td>51</td><td></td>
        </tr>
      </table>
    `);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      bonusPointsLosing: 2,
      bonusPointsTry: 9,
      pointsAgainst: 298,
      pointsFor: 562,
      teamName: "Hurricanes",
      totalPoints: 55,
      triesFor: 86,
    });
  });
});
