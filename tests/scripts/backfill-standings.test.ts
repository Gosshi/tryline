import { describe, expect, it, vi } from "vitest";

import {
  buildResolvedStandingsTeamLookup,
  buildStandingsTeamLookup,
  collectCompetitionTeamIds,
  parseOptions,
  resolveWikipediaStandingsUrl,
  warnUnmatchedStandingsTeams,
} from "@/scripts/backfill-standings";

function standingsRow(teamName: string) {
  return {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 0,
    played: 1,
    pointsAgainst: 10,
    pointsFor: 20,
    position: 1,
    teamName,
    totalPoints: 4,
    triesFor: 0,
    won: 1,
  };
}

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
      [standingsRow("Newcastle Red Bulls")],
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

  it("selects a mapped team even when it has no competition match yet", () => {
    const rows = [standingsRow("Clermont")];
    const teams = [
      {
        englishName: "ASM Clermont Auvergne",
        id: "clermont-id",
        name: "ASM Clermont Auvergne",
        slug: "asm-clermont-auvergne",
      },
      {
        englishName: "RC Toulon",
        id: "toulon-id",
        name: "RC Toulon",
        slug: "rc-toulon",
      },
    ];

    expect(
      buildResolvedStandingsTeamLookup(rows, teams, ["toulon-id"]),
    ).toEqual({
      Clermont: "clermont-id",
    });
  });

  it("uses the competition match team to resolve an ambiguous alias", () => {
    const rows = [standingsRow("Lions")];
    const teams = [
      {
        englishName: "Lions",
        id: "urc-lions-id",
        name: "Lions",
        slug: "lions",
      },
      {
        englishName: "Lions",
        id: "other-lions-id",
        name: "Lions",
        slug: "other-lions",
      },
    ];

    expect(
      buildResolvedStandingsTeamLookup(rows, teams, ["urc-lions-id"]),
    ).toEqual({
      Lions: "urc-lions-id",
    });
  });

  it("leaves an ambiguous alias unmatched without a unique match team", () => {
    const rows = [standingsRow("Lions")];
    const teams = [
      {
        englishName: "Lions",
        id: "first-lions-id",
        name: "Lions",
        slug: "first-lions",
      },
      {
        englishName: "Lions",
        id: "second-lions-id",
        name: "Lions",
        slug: "second-lions",
      },
    ];

    expect(buildResolvedStandingsTeamLookup(rows, teams, [])).toEqual({});
  });

  it("logs an unmatched standings team", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    warnUnmatchedStandingsTeams([standingsRow("Unknown RFC")], {});

    expect(warn).toHaveBeenCalledWith("[standings] unmatched team", {
      name: "Unknown RFC",
    });
    warn.mockRestore();
  });
});
