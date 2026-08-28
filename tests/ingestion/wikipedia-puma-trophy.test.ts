import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parsePumaTrophyLiveHtml } from "@/lib/ingestion/sources/wikipedia-puma-trophy";

const WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2026_Australia_rugby_union_tour_of_Argentina";

describe("parsePumaTrophyLiveHtml", () => {
  it("parses the two fixtures from the captured Wikipedia page", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-puma-trophy-2026.html",
    );
    const matches = parsePumaTrophyLiveHtml(
      readFileSync(fixturePath, "utf8"),
      WIKIPEDIA_URL,
    );

    expect(matches).toHaveLength(2);
    expect(
      matches.map((match) => ({
        awayTeamName: match.awayTeamName,
        homeTeamName: match.homeTeamName,
        kickoffAt: match.kickoffAt,
        venue: match.venue,
      })),
    ).toEqual([
      {
        awayTeamName: "Australia",
        homeTeamName: "Argentina",
        kickoffAt: "2026-08-29T19:00:00.000Z",
        venue: "Estadio 23 de Agosto, San Salvador de Jujuy",
      },
      {
        awayTeamName: "Australia",
        homeTeamName: "Argentina",
        kickoffAt: "2026-09-05T21:00:00.000Z",
        venue: "Estadio Malvinas Argentinas, Mendoza",
      },
    ]);
    expect(
      matches.every(
        (match) =>
          match.homeTeamSlug === "argentina" &&
          match.awayTeamSlug === "australia",
      ),
    ).toBe(true);
  });
});
