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
