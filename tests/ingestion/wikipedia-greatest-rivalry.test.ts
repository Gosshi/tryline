import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseGreatestRivalryLiveHtml } from "@/lib/ingestion/sources/wikipedia-greatest-rivalry";

const WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2026_New_Zealand_rugby_union_tour_of_South_Africa";

describe("parseGreatestRivalryLiveHtml", () => {
  it("parses all eight fixtures from the captured Wikipedia page", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-greatest-rivalry-2026.html",
    );
    const matches = parseGreatestRivalryLiveHtml(
      readFileSync(fixturePath, "utf8"),
      WIKIPEDIA_URL,
    );

    expect(matches).toHaveLength(8);
    expect(
      matches.map((match) => ({
        awayTeamName: match.awayTeamName,
        eventId: match.eventId,
        homeTeamName: match.homeTeamName,
        kickoffAt: match.kickoffAt,
      })),
    ).toEqual([
      {
        awayTeamName: "New Zealand",
        eventId: "Stormers",
        homeTeamName: "Stormers",
        kickoffAt: "2026-08-07T17:10:00.000Z",
      },
      {
        awayTeamName: "New Zealand",
        eventId: "Sharks",
        homeTeamName: "Sharks",
        kickoffAt: "2026-08-11T17:10:00.000Z",
      },
      {
        awayTeamName: "New Zealand",
        eventId: "Bulls",
        homeTeamName: "Bulls",
        kickoffAt: "2026-08-15T17:10:00.000Z",
      },
      {
        awayTeamName: "New Zealand",
        eventId: "First_test",
        homeTeamName: "South Africa",
        kickoffAt: "2026-08-22T15:10:00.000Z",
      },
      {
        awayTeamName: "New Zealand",
        eventId: "Lions",
        homeTeamName: "Lions",
        kickoffAt: "2026-08-25T17:10:00.000Z",
      },
      {
        awayTeamName: "New Zealand",
        eventId: "Second_test",
        homeTeamName: "South Africa",
        kickoffAt: "2026-08-29T15:10:00.000Z",
      },
      {
        awayTeamName: "New Zealand",
        eventId: "Third_test",
        homeTeamName: "South Africa",
        kickoffAt: "2026-09-05T15:10:00.000Z",
      },
      {
        awayTeamName: "New Zealand",
        eventId: "Fourth_test",
        homeTeamName: "South Africa",
        kickoffAt: "2026-09-12T21:00:00.000Z",
      },
    ]);
    expect(matches.every((match) => Boolean(match.homeTeamSlug && match.awayTeamSlug))).toBe(
      true,
    );
    expect(
      matches.every(
        (match) => match.round === null && match.roundName === null,
      ),
    ).toBe(true);
    expect(
      matches.filter(
        (match) =>
          match.homeTeamName === "South Africa" &&
          match.awayTeamName === "New Zealand",
      ),
    ).toHaveLength(4);
  });
});
