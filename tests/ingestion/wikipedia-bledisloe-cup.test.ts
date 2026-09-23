import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  fetchBledisloeCup2026,
  parseBledisloeCupLiveHtml,
} from "@/lib/ingestion/sources/wikipedia-bledisloe-cup";
import { FetchError } from "@/lib/scrapers/errors";

const WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/2026_Bledisloe_Cup";

describe("parseBledisloeCupLiveHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses both fixtures from the captured real Wikipedia page", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-bledisloe-cup-2026.html",
    );
    const matches = parseBledisloeCupLiveHtml(
      readFileSync(fixturePath, "utf8"),
      WIKIPEDIA_URL,
    );

    expect(matches).toHaveLength(2);
    expect(
      matches.map((match) => ({
        awayTeamSlug: match.awayTeamSlug,
        homeTeamSlug: match.homeTeamSlug,
        kickoffAt: match.kickoffAt,
        venue: match.venue,
      })),
    ).toEqual([
      {
        awayTeamSlug: "australia",
        homeTeamSlug: "new-zealand",
        kickoffAt: "2026-10-10T06:10:00.000Z",
        venue: "Eden Park, Auckland",
      },
      {
        awayTeamSlug: "new-zealand",
        homeTeamSlug: "australia",
        kickoffAt: "2026-10-17T04:45:00.000Z",
        venue: "Stadium Australia, Sydney",
      },
    ]);
  });

  it("removes a numeric footnote suffix from the venue", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-bledisloe-cup-2026.html",
    );
    const html = readFileSync(fixturePath, "utf8").replace(
      'title="Auckland">Auckland</a>',
      'title="Auckland">Auckland</a>[1]',
    );

    expect(parseBledisloeCupLiveHtml(html, WIKIPEDIA_URL)[0]?.venue).toBe(
      "Eden Park, Auckland",
    );
  });

  it("drops matches that contain an unrecognized team name", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-bledisloe-cup-2026.html",
    );
    const html = readFileSync(fixturePath, "utf8").replaceAll(
      "New Zealand",
      "Unknown Rugby Team",
    );

    expect(parseBledisloeCupLiveHtml(html, WIKIPEDIA_URL)).toEqual([]);
  });

  it("returns an empty list when the Wikipedia page is missing", async () => {
    fetcherMock.fetchWithPolicy.mockRejectedValueOnce(
      new FetchError({ attempt: 1, status: 404, url: WIKIPEDIA_URL }),
    );

    await expect(fetchBledisloeCup2026()).resolves.toEqual([]);
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledWith(WIKIPEDIA_URL);
  });

  it("rethrows non-404 fetch errors", async () => {
    const error = new FetchError({
      attempt: 1,
      status: 500,
      url: WIKIPEDIA_URL,
    });
    fetcherMock.fetchWithPolicy.mockRejectedValueOnce(error);

    await expect(fetchBledisloeCup2026()).rejects.toBe(error);
  });
});
