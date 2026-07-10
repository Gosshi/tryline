import { describe, expect, it } from "vitest";

import { selectSampleMatchIds } from "@/lib/db/queries/sample-matches";
import {
  FALLBACK_SAMPLE_MATCH_IDS,
  PRIMARY_SAMPLE_MATCH_ID,
  SAMPLE_MATCH_IDS,
} from "@/lib/sample-matches";

describe("sample matches", () => {
  it("keeps the fallback sample list available", () => {
    expect(SAMPLE_MATCH_IDS).toHaveLength(8);
    expect(SAMPLE_MATCH_IDS[0]).toBe(PRIMARY_SAMPLE_MATCH_ID);
    expect(FALLBACK_SAMPLE_MATCH_IDS[0]).toBe(PRIMARY_SAMPLE_MATCH_ID);
  });

  it("selects recent sample matches without overloading one competition", () => {
    const selected = selectSampleMatchIds([
      {
        awayScore: 20,
        competitionFamily: "premiership",
        homeScore: 21,
        id: "prem-1",
        kickoffAt: "2026-07-09T10:00:00.000Z",
      },
      {
        awayScore: 19,
        competitionFamily: "premiership",
        homeScore: 21,
        id: "prem-2",
        kickoffAt: "2026-07-08T10:00:00.000Z",
      },
      {
        awayScore: 18,
        competitionFamily: "premiership",
        homeScore: 21,
        id: "prem-3",
        kickoffAt: "2026-07-07T10:00:00.000Z",
      },
      {
        awayScore: 20,
        competitionFamily: "urc",
        homeScore: 22,
        id: "urc-1",
        kickoffAt: "2026-07-06T10:00:00.000Z",
      },
      {
        awayScore: 10,
        competitionFamily: "top-14",
        homeScore: 12,
        id: "top14-1",
        kickoffAt: "2026-07-05T10:00:00.000Z",
      },
    ], 4);

    expect(selected).toEqual(["prem-1", "prem-2", "urc-1", "top14-1"]);
  });
});
