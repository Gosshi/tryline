import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseJapanTestHistory } from "@/lib/ingestion/sources/wikipedia-japan-test-history";

// Captured unchanged through fetchWikipediaWikitext on 2026-09-23 (87,749 bytes).
const fixture = await readFile(
  "tests/fixtures/wikipedia-japan-test-matches.wiki",
  "utf8",
);
const matches = parseJapanTestHistory(fixture, "2026-09-23");
const countFor = (name: string) =>
  matches.filter((match) => match.opponentName === name).length;

describe("parseJapanTestHistory", () => {
  it("uses each table header, handles both layouts, and matches the known test counts", () => {
    expect(countFor("Wales")).toBe(13);
    expect(countFor("England")).toBe(6);
    expect(countFor("Scotland")).toBe(9);
    expect(countFor("Fiji")).toBe(22);
    expect(countFor("United States")).toBe(26);
    expect(matches).toContainEqual(
      expect.objectContaining({
        playedOn: "2013-06-15",
        opponentName: "Wales",
        teamScore: 23,
        opponentScore: 8,
      }),
    );
    expect(matches).toContainEqual(
      expect.objectContaining({
        playedOn: "2021-07-03",
        opponentName: "Ireland",
        teamScore: 31,
        opponentScore: 39,
      }),
    );
    expect(
      matches
        .filter((match) => match.venue)
        .every((match) => !/\[\[|\]\]|<ref/i.test(match.venue!)),
    ).toBe(true);
    expect(matches.some((match) => match.competitionLabel !== null)).toBe(true);
    expect(matches.some((match) => match.venue?.includes(", "))).toBe(true);
  });

  it("requires the link display name to match the national team name", () => {
    expect(matches.some((match) => match.opponentName === "Wales XV")).toBe(
      false,
    );
    expect(matches.some((match) => match.opponentName === "England XV")).toBe(
      false,
    );
  });

  it("ignores unplayed, future, and malformed score rows", () => {
    const parsed = parseJapanTestHistory(
      `{|\n! Date !! Opponent !! F !! A\n|-\n| 2027-10-03 || [[France national rugby union team|France]] || ||\n|-\n| 2027-10-10 || [[France national rugby union team|France]] || 0 || 0\n|-\n| 2020-01-01 || [[France national rugby union team|France]] || x || 2\n|}`,
      "2026-09-23",
    );
    expect(parsed).toEqual([]);
  });
});
