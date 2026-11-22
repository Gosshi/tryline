import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseNationsChampionshipLiveHtml } from "@/lib/ingestion/sources/wikipedia-nations-championship";

import type { WorldRugbyNationsChampionshipTime } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";

const html = readFileSync(
  new URL("../fixtures/nc-finals-kickoff-collision.html", import.meta.url),
  "utf8",
);
const past: WorldRugbyNationsChampionshipTime = {
  homeTeamSlug: "wales",
  awayTeamSlug: "japan",
  kickoffAt: "2026-11-07T15:10:00Z",
  round: 4,
  venue: "Cardiff",
  worldRugbyMatchId: "past",
};
const final = {
  ...past,
  kickoffAt: "2026-11-28T13:10:00Z",
  round: 7,
  venue: "Twickenham",
  worldRugbyMatchId: "final",
};
afterEach(() => vi.restoreAllMocks());
describe("NC finals kickoff collision", () => {
  it.each([
    [past, final],
    [final, past],
  ])(
    "matches each repeated pairing by date regardless of source order",
    (...times) => {
      const matches = parseNationsChampionshipLiveHtml(html, times);
      expect(matches).toHaveLength(2);
      expect(matches[0]).toMatchObject({
        kickoffAt: past.kickoffAt,
        kickoffTimeTbd: false,
        round: 4,
        venue: "Cardiff",
        homeScore: 28,
        awayScore: 21,
      });
      expect(matches[1]).toMatchObject({
        kickoffAt: final.kickoffAt,
        kickoffTimeTbd: false,
        round: 7,
        venue: "Twickenham",
        status: "scheduled",
      });
    },
  );
  it("leaves ambiguous candidates alone and warns once with pairing and date", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const baseline = parseNationsChampionshipLiveHtml(html);
    const matches = parseNationsChampionshipLiveHtml(html, [
      past,
      { ...past, kickoffAt: "2026-11-07T16:00:00Z" },
    ]);
    expect(matches).toEqual(baseline);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      expect.objectContaining({
        homeTeamSlug: "wales",
        awayTeamSlug: "japan",
        kickoffAt: baseline[0]!.kickoffAt,
      }),
    );
  });
  it("keeps the Wikipedia candidate when no time is within 36 hours", () => {
    expect(
      parseNationsChampionshipLiveHtml(html, [
        { ...past, kickoffAt: "2026-11-08T12:00:00.001Z" },
      ]),
    ).toEqual(parseNationsChampionshipLiveHtml(html));
  });
  it("includes the 36-hour boundary and ignores reversed teams", () => {
    const atBoundary = { ...past, kickoffAt: "2026-11-08T12:00:00Z" };
    expect(
      parseNationsChampionshipLiveHtml(html, [atBoundary])[0],
    ).toMatchObject({ kickoffAt: atBoundary.kickoffAt, kickoffTimeTbd: false });
    expect(
      parseNationsChampionshipLiveHtml(html, [
        { ...past, homeTeamSlug: "japan", awayTeamSlug: "wales" },
      ]),
    ).toEqual(parseNationsChampionshipLiveHtml(html));
  });
});
