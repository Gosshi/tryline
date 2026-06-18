import { describe, expect, it } from "vitest";

import {
  buildStandingsTeamLookup,
  collectCompetitionTeamIds,
  parseOptions,
  resolveWikipediaStandingsUrl,
} from "@/scripts/backfill-standings";

describe("backfill-standings", () => {
  it("parses the target and safety flags", () => {
    expect(
      parseOptions([
        "--family=urc",
        "--season=2025-26",
        "--dry-run",
      ]),
    ).toEqual({
      dryRun: true,
      family: "urc",
      ownerApproved: false,
      season: "2025-26",
    });
  });

  it("rejects unsupported or incomplete targets", () => {
    expect(() => parseOptions(["--family=unknown", "--season=2025"])).toThrow(
      "Usage:",
    );
    expect(() => parseOptions(["--family=urc"])).toThrow("Usage:");
  });

  it("builds Wikipedia URLs for annual and range seasons", () => {
    expect(resolveWikipediaStandingsUrl("urc", "2025-26")).toBe(
      "https://en.wikipedia.org/wiki/2025–26_United_Rugby_Championship",
    );
    expect(resolveWikipediaStandingsUrl("six-nations", "2026")).toBe(
      "https://en.wikipedia.org/wiki/2026_Six_Nations_Championship",
    );
    expect(resolveWikipediaStandingsUrl("league-one", "2025-26")).toBe(
      "https://es.wikipedia.org/wiki/Japan_Rugby_League_One_2025-26",
    );
  });

  it("matches Wikipedia aliases to competition teams", () => {
    const lookup = buildStandingsTeamLookup(
      [
        {
          bonusPointsLosing: 0,
          bonusPointsTry: 0,
          drawn: 0,
          lost: 0,
          played: 1,
          pointsAgainst: 10,
          pointsFor: 20,
          position: 1,
          teamName: "Newcastle Red Bulls",
          totalPoints: 4,
          triesFor: 0,
          won: 1,
        },
      ],
      [
        {
          englishName: "Newcastle Falcons",
          id: "newcastle-id",
          name: "Newcastle Falcons",
          slug: "newcastle-falcons",
        },
      ],
    );

    expect(lookup).toEqual({
      "Newcastle Red Bulls": "newcastle-id",
    });
  });

  it("collects distinct team ids from competition matches", () => {
    expect(
      collectCompetitionTeamIds([
        {
          away_team_id: "team-b",
          home_team_id: "team-a",
        },
        {
          away_team_id: "team-c",
          home_team_id: "team-b",
        },
        {
          away_team_id: "team-a",
          home_team_id: "team-c",
        },
      ]),
    ).toEqual(["team-a", "team-b", "team-c"]);
  });
});
