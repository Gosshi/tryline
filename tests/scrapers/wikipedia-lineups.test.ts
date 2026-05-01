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

  it("parses lineup tables from a season-page vevent block", async () => {
    const html = `
      <div class="vevent summary">
        <table class="wikitable">
          <tr><td><a>France</a></td><td>35-16</td><td><a>Scotland</a></td></tr>
        </table>
        <table class="wikitable">
          <tr><th>No.</th><th>Player</th></tr>
          <tr><td>1</td><td><a>Home Prop</a></td></tr>
          <tr><td>15</td><td>Home Fullback</td></tr>
          <tr><td>24</td><td>Ignored Player</td></tr>
        </table>
        <table class="wikitable">
          <tr><th>No.</th><th>Player</th></tr>
          <tr><td>1</td><td><a>Away Prop</a></td></tr>
          <tr><td>23</td><td>Away Replacement</td></tr>
        </table>
      </div>
    `;

    const { parseLineupFromVeventHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");
    const result = parseLineupFromVeventHtml(
      html,
      "https://en.wikipedia.org/wiki/sample",
    );

    expect(result).not.toBeNull();
    expect(result?.home_players).toEqual([
      { jersey_number: 1, name: "Home Prop" },
      { jersey_number: 15, name: "Home Fullback" },
    ]);
    expect(result?.away_players).toEqual([
      { jersey_number: 1, name: "Away Prop" },
      { jersey_number: 23, name: "Away Replacement" },
    ]);
  });

  it("returns null when a vevent has no lineup tables", async () => {
    const { parseLineupFromVeventHtml } =
      await import("@/lib/scrapers/wikipedia-lineups");

    expect(
      parseLineupFromVeventHtml(
        '<div class="vevent summary"><table class="wikitable"></table></div>',
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
