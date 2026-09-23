import { describe, expect, it } from "vitest";

import {
  countHeadToHeadRecords,
  mergeHeadToHeadRecords,
  summarizeHeadToHeadRecord,
  type HeadToHeadHistoryRow,
  type HeadToHeadMatch,
} from "@/lib/db/queries/matches";

const teamA = { slug: "japan", name: "日本", shortCode: "JPN" };
const history = (
  playedOn: string,
  teamScore: number,
  opponentScore: number,
): HeadToHeadHistoryRow => ({
  playedOn,
  teamSlug: "japan",
  opponentSlug: "wales",
  teamScore,
  opponentScore,
  venue: "Tokyo",
  competitionLabel: null,
});
const match = (
  kickoffAt: string,
  homeSlug = "wales",
  homeScore: number | null = 24,
  awayScore: number | null = 23,
) =>
  ({
    id: "match",
    kickoffAt,
    status: "finished",
    homeTeam: { slug: homeSlug },
    awayTeam: { slug: homeSlug === "wales" ? "japan" : "wales" },
    homeScore,
    awayScore,
  }) as HeadToHeadMatch;

describe("head-to-head historical records", () => {
  it("deduplicates either home/away direction within one UTC day, but not two days", () => {
    const recent = history("2025-11-15", 23, 24);
    expect(
      mergeHeadToHeadRecords([recent], [match("2025-11-15T17:40:00Z")]),
    ).toEqual([]);
    expect(
      mergeHeadToHeadRecords([recent], [match("2025-11-14T23:30:00Z")]),
    ).toEqual([]);
    expect(
      mergeHeadToHeadRecords([recent], [match("2025-11-13T12:00:00Z")]),
    ).toEqual([recent]);
  });

  it("counts wins, losses, draws, and first meeting from the teamA perspective", () => {
    const records = [
      history("1973-09-24", 10, 7),
      history("1980-01-01", 3, 12),
      history("1990-01-01", 8, 8),
    ];
    expect(summarizeHeadToHeadRecord(records, [], teamA)).toEqual({
      total: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      firstPlayedOn: "1973-09-24",
    });
    const duplicateSummary = summarizeHeadToHeadRecord(
      [history("1973-09-24", 10, 7)],
      [match("1973-09-24T12:00:00Z")],
      { ...teamA, slug: "wales" },
    );
    expect(duplicateSummary).toMatchObject({ total: 1, wins: 1, losses: 0 });
    expect(
      summarizeHeadToHeadRecord([history("1973-09-24", 10, 7)], [], {
        ...teamA,
        slug: "wales",
      }),
    ).toMatchObject({ wins: 0, losses: 1 });
  });

  it("counts eleven distinct meetings when one history row duplicates a match", () => {
    const rows = Array.from({ length: 11 }, (_, index) =>
      history(index === 0 ? "2025-11-15" : `200${index}-01-01`, 20, 10),
    );
    expect(countHeadToHeadRecords(rows, [match("2025-11-15T17:40:00Z")])).toBe(
      11,
    );
  });
});
