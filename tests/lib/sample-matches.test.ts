import { beforeEach, describe, expect, it, vi } from "vitest";

const sampleMatchQueryMocks = vi.hoisted(() => ({
  listCachedSampleMatchIds: vi.fn(),
}));

vi.mock("@/lib/db/queries/sample-matches", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  listCachedSampleMatchIds: sampleMatchQueryMocks.listCachedSampleMatchIds,
}));

import { selectSampleMatchIds } from "@/lib/db/queries/sample-matches";
import {
  FALLBACK_SAMPLE_MATCH_IDS,
  getPrimarySampleMatchId,
  getSampleMatchIds,
  isSampleMatch,
  PRIMARY_SAMPLE_MATCH_ID,
  SAMPLE_MATCH_IDS,
} from "@/lib/sample-matches";

describe("sample matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the fallback sample list available", () => {
    expect(SAMPLE_MATCH_IDS).toHaveLength(8);
    expect(SAMPLE_MATCH_IDS[0]).toBe(PRIMARY_SAMPLE_MATCH_ID);
    expect(FALLBACK_SAMPLE_MATCH_IDS[0]).toBe(PRIMARY_SAMPLE_MATCH_ID);
  });

  it("uses cached sample match ids when available", async () => {
    sampleMatchQueryMocks.listCachedSampleMatchIds.mockResolvedValue([
      "dynamic-sample-1",
      "dynamic-sample-2",
    ]);

    await expect(getSampleMatchIds()).resolves.toEqual([
      "dynamic-sample-1",
      "dynamic-sample-2",
    ]);
    await expect(getPrimarySampleMatchId()).resolves.toBe("dynamic-sample-1");
    await expect(isSampleMatch("dynamic-sample-2")).resolves.toBe(true);
    await expect(isSampleMatch(FALLBACK_SAMPLE_MATCH_IDS[1])).resolves.toBe(
      false,
    );
  });

  it("falls back when the sample match cache is empty", async () => {
    sampleMatchQueryMocks.listCachedSampleMatchIds.mockResolvedValue([]);

    await expect(getSampleMatchIds()).resolves.toEqual([
      ...FALLBACK_SAMPLE_MATCH_IDS,
    ]);
    await expect(getPrimarySampleMatchId()).resolves.toBe(
      PRIMARY_SAMPLE_MATCH_ID,
    );
    await expect(isSampleMatch(FALLBACK_SAMPLE_MATCH_IDS[1])).resolves.toBe(
      true,
    );
  });

  it("falls back when the sample match cache query fails", async () => {
    sampleMatchQueryMocks.listCachedSampleMatchIds.mockRejectedValue(
      new Error("db failure"),
    );

    await expect(getSampleMatchIds()).resolves.toEqual([
      ...FALLBACK_SAMPLE_MATCH_IDS,
    ]);
    await expect(getPrimarySampleMatchId()).resolves.toBe(
      PRIMARY_SAMPLE_MATCH_ID,
    );
    await expect(isSampleMatch(FALLBACK_SAMPLE_MATCH_IDS[1])).resolves.toBe(
      true,
    );
  });

  it("selects recent sample matches without overloading one competition", () => {
    const selected = selectSampleMatchIds(
      [
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
      ],
      4,
    );

    expect(selected).toEqual(["prem-1", "prem-2", "urc-1", "top14-1"]);
  });
});
