import { describe, expect, it } from "vitest";

import {
  buildTop14CalendarUrl,
  findTop14CalendarMatch,
  getRoundSlug,
  parseOptions,
  parseTop14CalendarMatchLinks,
  toLnrSeason,
} from "@/scripts/backfill-top14-team-stats";

import type { Json } from "@/lib/db/types";

const CALENDAR_HTML = `
  <a href="https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11471-pau-clermont">Pau v Clermont</a>
  <a href="https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11469-lyon-bayonne">Lyon v Bayonne</a>
  <a href="/feuille-de-match/2025-2026/finale/11800-toulouse-montpellier">Finale</a>
`;

describe("backfill-top14-team-stats helpers", () => {
  it("parses options and requires explicit write approval", () => {
    expect(parseOptions(["--dry-run", "--season=2025-26"])).toEqual({
      dryRun: true,
      ownerApproved: false,
      season: "2025-26",
    });
    expect(() => parseOptions([])).toThrow("Writes require");
  });

  it("converts Tryline seasons and round metadata to LNR URLs", () => {
    expect(toLnrSeason("2025-26")).toBe("2025-2026");
    expect(getRoundSlug({ wikipedia_round: 24 } as Json)).toBe("j24");
    expect(getRoundSlug({ round_name: "Final" } as Json)).toBe("finale");
    expect(buildTop14CalendarUrl("2025-26", "j24")).toBe(
      "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j24",
    );
  });

  it("extracts LNR match ids and stats URLs from calendar HTML", () => {
    expect(parseTop14CalendarMatchLinks(CALENDAR_HTML)).toEqual([
      {
        awaySlug: "clermont",
        homeSlug: "pau",
        id: "11471",
        matchPath: "/feuille-de-match/2025-2026/j24/11471-pau-clermont",
        roundSlug: "j24",
        season: "2025-2026",
        statsUrl:
          "https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11471-pau-clermont/statistiques-du-match",
      },
      {
        awaySlug: "bayonne",
        homeSlug: "lyon",
        id: "11469",
        matchPath: "/feuille-de-match/2025-2026/j24/11469-lyon-bayonne",
        roundSlug: "j24",
        season: "2025-2026",
        statsUrl:
          "https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11469-lyon-bayonne/statistiques-du-match",
      },
      {
        awaySlug: "montpellier",
        homeSlug: "toulouse",
        id: "11800",
        matchPath:
          "/feuille-de-match/2025-2026/finale/11800-toulouse-montpellier",
        roundSlug: "finale",
        season: "2025-2026",
        statsUrl:
          "https://top14.lnr.fr/feuille-de-match/2025-2026/finale/11800-toulouse-montpellier/statistiques-du-match",
      },
    ]);
  });

  it("matches a DB row to a calendar link by team slugs", () => {
    const links = parseTop14CalendarMatchLinks(CALENDAR_HTML);
    const matched = findTop14CalendarMatch(
      {
        away_team: { name: "Aviron Bayonnais", slug: "aviron-bayonnais" },
        away_team_id: "away",
        competition_id: "competition",
        external_ids: { wikipedia_round: 24 } as Json,
        home_team: { name: "Lyon OU", slug: "lyon" },
        home_team_id: "home",
        id: "match",
        kickoff_at: "2026-05-16T19:05:00.000Z",
      },
      links,
    );

    expect(matched?.id).toBe("11469");
  });
});
