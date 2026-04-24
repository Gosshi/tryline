import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

describe("wikipedia squads scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses squad tables and deduplicates players by name", async () => {
    const fixturePath = path.join(process.cwd(), "tests/fixtures/wikipedia-squads-2025.html");
    const html = readFileSync(fixturePath, "utf8");

    const { parseWikipediaSquadsHtml } = await import("@/lib/scrapers/wikipedia-squads");
    const result = parseWikipediaSquadsHtml(html);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      team_slug: "england",
      name: "Marcus Smith",
      position: "FH",
      caps: 39,
      date_of_birth: "1999-02-14",
    });
    expect(result[2]).toMatchObject({
      team_slug: "france",
      name: "Antoine Dupont",
    });
  });

  it("returns an empty array when no .wikitable is present", async () => {
    const { parseWikipediaSquadsHtml } = await import("@/lib/scrapers/wikipedia-squads");

    expect(parseWikipediaSquadsHtml("<html><body><p>no tables</p></body></html>")).toEqual([]);
  });

  it("uses fetchWithPolicy for network access", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue(
      new Response('<table class="wikitable"></table>', { status: 200 }),
    );

    const { scrapeSquads } = await import("@/lib/scrapers/wikipedia-squads");
    await scrapeSquads("https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads");

    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(1);
  });
});
