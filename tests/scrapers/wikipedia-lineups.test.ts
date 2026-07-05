import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

describe("wikipedia lineups scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses two lineup tables into home/away jersey lists", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-lineup-match.html",
    );
    const html = readFileSync(fixturePath, "utf8");

    const { parseWikipediaLineupHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");
    const result = parseWikipediaLineupHtml(
      html,
      "https://en.wikipedia.org/wiki/sample",
    );

    expect(result).not.toBeNull();
    expect(result?.home_players).toEqual([
      { jersey_number: 1, name: "Player A" },
      { jersey_number: 16, name: "Player B" },
    ]);
    expect(result?.away_players).toEqual([
      { jersey_number: 1, name: "Player C" },
      { jersey_number: 23, name: "Player D" },
    ]);
  });

  it("returns null when lineups section is missing", async () => {
    const { parseWikipediaLineupHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");

    expect(
      parseWikipediaLineupHtml("<h2>No lineups</h2>", "https://example.com"),
    ).toBeNull();
  });

  it("parses lineups from a season-page lineup table", async () => {
    const html = `
      <table>
        <tr>
          <td>summary</td><td>FB</td><td>15</td><td>Home Fullback</td>
          <td>RW</td><td>14</td><td>Home Wing</td><td>x</td><td>x</td><td>x</td><td>x</td>
        </tr>
        <tr></tr>
        <tr><td>FB</td><td>15</td><td><a>Home Fullback</a></td></tr>
        <tr><td>RW</td><td>14</td><td>Home Wing</td></tr>
        <tr><td colspan="3">Replacements:</td></tr>
        <tr><td>R</td><td>16</td><td>Home Hooker</td></tr>
        <tr><td>Coach:</td><td>Home Coach</td></tr>
        <tr><td>FB</td><td>15</td><td>Away Fullback</td></tr>
        <tr><td>RW</td><td>14</td><td>Away Wing</td></tr>
        <tr><td>R</td><td>23</td><td>Away Replacement</td></tr>
      </table>
    `;

    const { parseLineupFromTableHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");
    const result = parseLineupFromTableHtml(
      html,
      "https://en.wikipedia.org/wiki/sample",
    );

    expect(result).not.toBeNull();
    expect(result?.home_players).toEqual([
      { jersey_number: 15, name: "Home Fullback" },
      { jersey_number: 14, name: "Home Wing" },
      { jersey_number: 16, name: "Home Hooker" },
    ]);
    expect(result?.away_players).toEqual([
      { jersey_number: 15, name: "Away Fullback" },
      { jersey_number: 14, name: "Away Wing" },
      { jersey_number: 23, name: "Away Replacement" },
    ]);
  });

  it("returns null when a season-page lineup table has no player rows", async () => {
    const { parseLineupFromTableHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");

    expect(
      parseLineupFromTableHtml(
        "<table><tr><td>Coach:</td><td>Someone</td></tr></table>",
        "https://example.com",
      ),
    ).toBeNull();
  });

  it("parses the target lineup from a Parsoid season-page vevent", async () => {
    const html = `
      <div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
      <section data-mw-section-id="5" aria-labelledby="Round_1">
        <div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
        <div class="vevent summary" id="Japan_v_Italy">
          <table><tbody><tr><td>4 July 2026<br />17:40 JST</td></tr></tbody></table>
          <table><tbody><tr>
            <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
            <td>24–19</td>
            <td class="vcard"><span class="fn org"><a>Italy</a></span></td>
          </tr></tbody></table>
          <table><tbody><tr><td><span class="location">Tokyo</span></td></tr></tbody></table>
        </div>
        <table>
          <tr><td>FB</td><td>15</td><td><a>Japan Fullback</a></td></tr>
          <tr><td>RW</td><td>14</td><td>Japan Wing</td></tr>
          <tr><td>R</td><td>16</td><td>Japan Hooker</td></tr>
          <tr><td>FB</td><td>15</td><td>Italy Fullback</td></tr>
          <tr><td>RW</td><td>14</td><td>Italy Wing</td></tr>
          <tr><td>R</td><td>23</td><td>Italy Replacement</td></tr>
        </table>
        <div class="vevent summary" id="New_Zealand_v_France">
          <table><tbody><tr><td>4 July 2026<br />19:05 NZST</td></tr></tbody></table>
          <table><tbody><tr>
            <td class="vcard"><span class="fn org"><a>New Zealand</a></span></td>
            <td>31–20</td>
            <td class="vcard"><span class="fn org"><a>France</a></span></td>
          </tr></tbody></table>
        </div>
        <table>
          <tr><td>FB</td><td>15</td><td>All Black Fullback</td></tr>
          <tr><td>FB</td><td>15</td><td>France Fullback</td></tr>
        </table>
      </section>
    `;

    const { parseSeasonPageLineupHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");
    const result = parseSeasonPageLineupHtml({
      awayTeamName: "Italy",
      homeTeamName: "Japan",
      html,
      kickoffAt: "2026-07-04T08:40:00.000Z",
      sourceUrl: "https://en.wikipedia.org/wiki/season",
    });

    expect(result).not.toBeNull();
    expect(result?.home_players).toEqual([
      { jersey_number: 15, name: "Japan Fullback" },
      { jersey_number: 14, name: "Japan Wing" },
      { jersey_number: 16, name: "Japan Hooker" },
    ]);
    expect(result?.away_players).toEqual([
      { jersey_number: 15, name: "Italy Fullback" },
      { jersey_number: 14, name: "Italy Wing" },
      { jersey_number: 23, name: "Italy Replacement" },
    ]);
  });

  it("returns null when a season page does not contain the requested team pair", async () => {
    const html = `
      <div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
      <section data-mw-section-id="5" aria-labelledby="Round_1">
        <div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
        <div class="vevent summary" id="Japan_v_Italy">
          <table><tbody><tr><td>4 July 2026<br />17:40 JST</td></tr></tbody></table>
          <table><tbody><tr>
            <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
            <td>24–19</td>
            <td class="vcard"><span class="fn org"><a>Italy</a></span></td>
          </tr></tbody></table>
        </div>
        <table><tr><td>FB</td><td>15</td><td>Japan Fullback</td></tr></table>
      </section>
    `;

    const { parseSeasonPageLineupHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");

    expect(
      parseSeasonPageLineupHtml({
        awayTeamName: "France",
        homeTeamName: "New Zealand",
        html,
        sourceUrl: "https://en.wikipedia.org/wiki/season",
      }),
    ).toBeNull();
  });

  it("returns null when the target season-page vevent has no adjacent lineup table", async () => {
    const html = `
      <div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
      <section data-mw-section-id="5" aria-labelledby="Round_1">
        <div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
        <div class="vevent summary" id="Japan_v_Italy">
          <table><tbody><tr><td>4 July 2026<br />17:40 JST</td></tr></tbody></table>
          <table><tbody><tr>
            <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
            <td>24–19</td>
            <td class="vcard"><span class="fn org"><a>Italy</a></span></td>
          </tr></tbody></table>
        </div>
      </section>
    `;

    const { parseSeasonPageLineupHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");

    expect(
      parseSeasonPageLineupHtml({
        awayTeamName: "Italy",
        homeTeamName: "Japan",
        html,
        sourceUrl: "https://en.wikipedia.org/wiki/season",
      }),
    ).toBeNull();
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response("<h2>No lineups</h2>"),
    );

    const { scrapeMatchLineup } =
      await import("@/lib/scrapers/wikipedia-lineups");
    await scrapeMatchLineup("https://en.wikipedia.org/wiki/match-page");

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);
  });
});
