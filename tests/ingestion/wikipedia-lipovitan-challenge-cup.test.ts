import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adaptLipovitanChallengeCupResults,
  fetchLipovitanChallengeCup2026,
} from "@/lib/ingestion/sources/wikipedia-lipovitan-challenge-cup";
import { FetchError } from "@/lib/scrapers/errors";
import { wikipediaLipovitanChallengeCupResultsScraper } from "@/lib/scrapers/wikipedia-lipovitan-challenge-cup-results";

import type { LipovitanChallengeCupMatchResult } from "@/lib/scrapers/wikipedia-lipovitan-challenge-cup-results";

const AUSTRALIA_JAPAN_WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2026_Australia%E2%80%93Japan_rugby_union_test_series";

function buildResult(
  overrides: Partial<LipovitanChallengeCupMatchResult>,
): LipovitanChallengeCupMatchResult {
  return {
    away_score: null,
    away_team_slug: "australia",
    home_score: null,
    home_team_slug: "japan",
    kickoff_at: "2026-08-08T10:05:00.000Z",
    round: null,
    season: 2026,
    source_url: "https://ja.wikipedia.org/wiki/example",
    status: "scheduled",
    venue: "Hanazono Rugby Stadium",
    wikipedia_event_id: "japan-vs-australia-2026-08-08",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Lipovitan Challenge Cup live source", () => {
  it("adapts results while assigning an English event URL only to Australia-Japan fixtures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const matches = adaptLipovitanChallengeCupResults([
      buildResult({ home_score: 32, away_score: 35, status: "finished" }),
      buildResult({
        away_team_slug: "canada",
        kickoff_at: "2026-09-05T05:50:00.000Z",
        wikipedia_event_id: "japan-vs-canada-2026-09-05",
      }),
      buildResult({
        away_team_slug: "fiji",
        kickoff_at: "2026-10-24T05:50:00.000Z",
        wikipedia_event_id: "japan-vs-fiji-2026-10-24",
      }),
      buildResult({
        away_team_slug: "japan",
        home_team_slug: "australia",
        kickoff_at: "2026-08-15T05:00:00.000Z",
        wikipedia_event_id: "australia-vs-japan-2026-08-15",
      }),
    ]);

    expect(matches).toHaveLength(4);
    expect(matches[0]).toMatchObject({
      awayScore: 35,
      awayTeamName: "Australia",
      homeScore: 32,
      homeTeamName: "Japan",
      rawHtml: "",
      wikipediaUrl: AUSTRALIA_JAPAN_WIKIPEDIA_URL,
    });
    expect(matches[1]?.wikipediaUrl).toBeNull();
    expect(matches[2]?.wikipediaUrl).toBeNull();
    expect(matches[3]?.wikipediaUrl).toBe(AUSTRALIA_JAPAN_WIKIPEDIA_URL);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("returns no matches when the existing scraper reports a missing Wikipedia page", async () => {
    vi.spyOn(
      wikipediaLipovitanChallengeCupResultsScraper,
      "fetchResults",
    ).mockRejectedValue(
      new FetchError({
        attempt: 1,
        status: 404,
        url: "https://en.wikipedia.org/wiki/missing",
      }),
    );

    await expect(fetchLipovitanChallengeCup2026()).resolves.toEqual([]);
  });
});
