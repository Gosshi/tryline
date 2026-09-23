import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  classifyInternationalFixtures,
  parseInternationalFixtures,
} from "@/lib/audit/missing-internationals";

const SOURCE_PAGE = "2026 men's rugby union internationals";
const WINDOW = { windowStart: "2026-09-23", windowEnd: "2026-10-23" };
const TEAM_IDS = new Map([
  ["AUS", "team-aus"],
  ["NZL", "team-nzl"],
  ["RSA", "team-rsa"],
]);

function parseFixtureBox(options: {
  date?: string;
  team1?: string;
  team2?: string;
  home?: string;
  away?: string;
  stadium?: string;
}) {
  return `{{rugbybox\n${Object.entries(options)
    .map(([key, value]) => `|${key} = ${value}`)
    .join("\n")}\n}}`;
}

describe("parseInternationalFixtures", () => {
  it("reproduces the 2026-09-23 audit sample from the captured live wikitext", () => {
    // Captured through fetchWikipediaWikitext on 2026-09-23; trailing horizontal whitespace was removed.
    const wikitext = readFileSync(
      "tests/fixtures/wikipedia-2026-mens-rugby-union-internationals.wiki",
      "utf8",
    );
    const fixtures = parseInternationalFixtures(wikitext, SOURCE_PAGE);
    const result = classifyInternationalFixtures({
      dbMatches: [
        {
          awayTeamId: "team-rsa",
          homeTeamId: "team-aus",
          kickoffAt: "2026-09-27T09:30:00.000Z",
        },
      ],
      fixtures,
      nationalTeamIdByCode: TEAM_IDS,
      ...WINDOW,
    });

    expect(
      result.missing.map(({ date, homeCode, awayCode }) => ({
        date,
        homeCode,
        awayCode,
      })),
    ).toEqual([
      { date: "2026-10-10", homeCode: "NZL", awayCode: "AUS" },
      { date: "2026-10-17", homeCode: "AUS", awayCode: "NZL" },
    ]);
    expect(
      result.present.map(({ date, homeCode, awayCode }) => ({
        date,
        homeCode,
        awayCode,
      })),
    ).toContainEqual({
      date: "2026-09-27",
      homeCode: "AUS",
      awayCode: "RSA",
    });
    expect(
      result.unresolved.map(({ date, homeCode, awayCode }) => ({
        date,
        homeCode,
        awayCode,
      })),
    ).toEqual(
      expect.arrayContaining([
        { date: "2026-09-26", homeCode: "GIB", awayCode: "MLT" },
        { date: "2026-10-10", homeCode: "ZIM", awayCode: "GER" },
      ]),
    );
  });

  it("supports both template capitalization and team field pairs", () => {
    const fixtures = parseInternationalFixtures(
      [
        parseFixtureBox({
          date: "10 October 2026",
          team1: "{{ru-rt|NZL}}",
          team2: "{{ru|AUS}}",
        }),
        parseFixtureBox({
          date: "17 October 2026",
          home: "{{Ru-rt|NZL}}",
          away: "{{Ru|AUS}}",
        }).replace("{{rugbybox", "{{Rugbybox"),
      ].join("\n"),
      SOURCE_PAGE,
    );

    expect(fixtures.map(({ homeCode, awayCode }) => [homeCode, awayCode])).toEqual([
      ["NZL", "AUS"],
      ["NZL", "AUS"],
    ]);
    expect(fixtures.every((fixture) => fixture.isSeniorSide)).toBe(true);
  });

  it("classifies A sides and XV fixtures as non-senior", () => {
    const fixtures = parseInternationalFixtures(
      [
        parseFixtureBox({
          date: "10 October 2026",
          team1: "{{RuA-rt|ENG|name=England A}}",
          team2: "{{ru|FRA}}",
        }),
        parseFixtureBox({
          date: "17 October 2026",
          team1: "{{ru|CHI|name=Chile XV}}",
          team2: "{{ru-rt|ARG}}",
        }),
      ].join("\n"),
      SOURCE_PAGE,
    );
    const result = classifyInternationalFixtures({
      dbMatches: [],
      fixtures,
      nationalTeamIdByCode: new Map([
        ["ENG", "team-eng"],
        ["FRA", "team-fra"],
        ["CHI", "team-chi"],
        ["ARG", "team-arg"],
      ]),
      ...WINDOW,
    });

    expect(result.nonSenior).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
  });

  it("puts boxes with unreadable dates or teams in unparsed without throwing", () => {
    const fixtures = parseInternationalFixtures(
      [
        parseFixtureBox({
          date: "TBC",
          team1: "{{ru-rt|NZL}}",
          team2: "{{ru|AUS}}",
        }),
        parseFixtureBox({ date: "10 October 2026", team1: "NZL" }),
      ].join("\n"),
      SOURCE_PAGE,
    );
    const result = classifyInternationalFixtures({
      dbMatches: [],
      fixtures,
      nationalTeamIdByCode: TEAM_IDS,
      ...WINDOW,
    });

    expect(result.unparsed).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
  });
});

describe("classifyInternationalFixtures", () => {
  const fixture = {
    awayCode: "AUS",
    date: "2026-10-10",
    homeCode: "NZL",
    isSeniorSide: true,
    sourcePage: SOURCE_PAGE,
    venue: null,
  };

  it("matches teams in either order and accepts a one-day UTC date shift", () => {
    const result = classifyInternationalFixtures({
      dbMatches: [
        {
          awayTeamId: "team-nzl",
          homeTeamId: "team-aus",
          kickoffAt: "2026-10-09T23:30:00.000Z",
        },
      ],
      fixtures: [fixture],
      nationalTeamIdByCode: TEAM_IDS,
      ...WINDOW,
    });

    expect(result.present).toEqual([fixture]);
    expect(result.missing).toHaveLength(0);
  });

  it("does not match a DB fixture two UTC days away", () => {
    const result = classifyInternationalFixtures({
      dbMatches: [
        {
          awayTeamId: "team-nzl",
          homeTeamId: "team-aus",
          kickoffAt: "2026-10-12T00:00:00.000Z",
        },
      ],
      fixtures: [fixture],
      nationalTeamIdByCode: TEAM_IDS,
      ...WINDOW,
    });

    expect(result.missing).toEqual([fixture]);
  });

  it("omits fixtures outside the requested date window", () => {
    const result = classifyInternationalFixtures({
      dbMatches: [],
      fixtures: [{ ...fixture, date: "2026-10-24" }],
      nationalTeamIdByCode: TEAM_IDS,
      ...WINDOW,
    });

    expect(result).toEqual({
      missing: [],
      nonSenior: [],
      present: [],
      unparsed: [],
      unresolved: [],
    });
  });
});
