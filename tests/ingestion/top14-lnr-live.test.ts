import { describe, expect, it, vi } from "vitest";

const top14LnrResultsMock = vi.hoisted(() => ({
  fetchTop14LnrRoundResultsWithDiagnostics: vi.fn(),
}));

vi.mock("@/lib/scrapers/top14-lnr-results", () => top14LnrResultsMock);

import {
  fetchTop14LnrLiveMatches,
  getDefaultTop14LnrRoundSlugs,
  MAX_TOP14_LNR_ROUNDS_PER_INGEST,
  TOP14_LNR_ROUND_DELAY_MS,
  toParsedTop14LnrLiveMatches,
} from "@/lib/ingestion/sources/top14-lnr-live";

import type { Top14LnrMatchResult } from "@/lib/scrapers/top14-lnr-results";

const RESULT: Top14LnrMatchResult = {
  away_score: null,
  away_team_slug: "clermont",
  home_score: null,
  home_team_slug: "lyon",
  kickoff_at: "2026-09-05T17:05:00.000Z",
  lnr_id: "11823",
  lnr_match_path: "/feuille-de-match/2026-2027/j1/11823-lyon-clermont",
  round: 1,
  round_slug: "j1",
  season: "2026-27",
  source_url: "https://top14.lnr.fr/calendrier-et-resultats/2026-2027/j1",
  status: "scheduled",
  venue: null,
};

describe("Top 14 LNR live source", () => {
  it("defaults to the opening round and its next round before the season", () => {
    expect(getDefaultTop14LnrRoundSlugs(new Date("2026-08-29T00:00:00Z"))).toEqual([
      "j1",
      "j2",
    ]);
  });

  it("maps LNR IDs into source external_ids without Wikipedia identifiers", () => {
    expect(toParsedTop14LnrLiveMatches([RESULT])).toEqual([
      expect.objectContaining({
        awayTeamSlug: "clermont",
        eventId: null,
        externalIds: {
          top14_lnr_id: "11823",
          top14_lnr_match_path:
            "/feuille-de-match/2026-2027/j1/11823-lyon-clermont",
          top14_lnr_round_slug: "j1",
          top14_lnr_url:
            "https://top14.lnr.fr/calendrier-et-resultats/2026-2027/j1",
        },
        homeTeamSlug: "lyon",
      }),
    ]);
  });

  it("caps explicit round fetches and waits between each requested round", async () => {
    const waitBetweenRounds = vi.fn().mockResolvedValue(undefined);
    top14LnrResultsMock.fetchTop14LnrRoundResultsWithDiagnostics
      .mockResolvedValueOnce({
        matches: [RESULT],
        unknownTeamNames: ["Promoted Club"],
      })
      .mockResolvedValueOnce({ matches: [], unknownTeamNames: [] });

    const result = await fetchTop14LnrLiveMatches({
      roundSlugs: ["j1", "j2"],
      waitBetweenRounds,
    });

    expect(result.unknownTeamNames).toEqual(["Promoted Club"]);
    expect(result.matches[0]).toMatchObject({
      externalIds: { top14_lnr_id: "11823" },
    });
    expect(waitBetweenRounds).toHaveBeenCalledWith(TOP14_LNR_ROUND_DELAY_MS);
    expect(
      top14LnrResultsMock.fetchTop14LnrRoundResultsWithDiagnostics,
    ).toHaveBeenNthCalledWith(1, "2026-27", "j1");
    expect(
      top14LnrResultsMock.fetchTop14LnrRoundResultsWithDiagnostics,
    ).toHaveBeenNthCalledWith(2, "2026-27", "j2");

    await expect(
      fetchTop14LnrLiveMatches({
        roundSlugs: Array.from(
          { length: MAX_TOP14_LNR_ROUNDS_PER_INGEST + 1 },
          (_, index) => `j${index + 1}`,
        ),
      }),
    ).rejects.toThrow("at most");
  });
});
