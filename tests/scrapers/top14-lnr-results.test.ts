import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTop14LnrCalendarUrl,
  parseTop14LnrCalendarHtmlWithDiagnostics,
  parseTop14LnrKickoffAt,
  TOP14_TEAM_SLUG_BY_LNR_NAME,
  toLnrSeason,
} from "@/lib/scrapers/top14-lnr-results";

const SEASON = "2026-27";
const SOURCE_URL =
  "https://top14.lnr.fr/calendrier-et-resultats/2026-2027/j1";
const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/top14-lnr-2026-27-j1.html",
);

function parseFixture(html = readFileSync(FIXTURE_PATH, "utf8")) {
  return parseTop14LnrCalendarHtmlWithDiagnostics({
    html,
    roundSlug: "j1",
    season: SEASON,
    sourceUrl: SOURCE_URL,
  });
}

describe("top14-lnr-results", () => {
  it("builds the LNR path URL without a query string", () => {
    expect(toLnrSeason(SEASON)).toBe("2026-2027");
    expect(buildTop14LnrCalendarUrl(SEASON, "j1")).toBe(SOURCE_URL);
  });

  it("parses all seven J1 fixtures from the captured LNR page", () => {
    const parsed = parseFixture();

    expect(parsed.unknownTeamNames).toEqual([]);
    expect(parsed.matches).toHaveLength(7);
    expect(
      parsed.matches.map((match) => ({
        away: match.away_team_slug,
        home: match.home_team_slug,
        kickoffAt: match.kickoff_at,
        lnrId: match.lnr_id,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          away: "toulon",
          home: "bayonne",
          kickoffAt: "2026-09-05T17:05:00.000Z",
          lnrId: "11819",
        },
        {
          away: "vannes",
          home: "castres",
          kickoffAt: "2026-09-05T17:05:00.000Z",
          lnrId: "11821",
        },
        {
          away: "racing-92",
          home: "bordeaux-begles",
          kickoffAt: "2026-09-05T19:15:00.000Z",
          lnrId: "11820",
        },
        {
          away: "perpignan",
          home: "stade-francais",
          kickoffAt: "2026-09-05T17:05:00.000Z",
          lnrId: "11825",
        },
        {
          away: "pau",
          home: "montpellier",
          kickoffAt: "2026-09-05T17:05:00.000Z",
          lnrId: "11824",
        },
        {
          away: "clermont",
          home: "lyon",
          kickoffAt: "2026-09-05T17:05:00.000Z",
          lnrId: "11823",
        },
        {
          away: "toulouse",
          home: "la-rochelle",
          kickoffAt: "2026-09-06T19:05:00.000Z",
          lnrId: "11822",
        },
      ]),
    );
  });

  it("resolves the four LNR display-name differences", () => {
    expect(TOP14_TEAM_SLUG_BY_LNR_NAME["ASM Clermont"]).toBe("clermont");
    expect(TOP14_TEAM_SLUG_BY_LNR_NAME["LOU Rugby"]).toBe("lyon");
    expect(TOP14_TEAM_SLUG_BY_LNR_NAME["Stade Français Paris"]).toBe(
      "stade-francais",
    );
    expect(TOP14_TEAM_SLUG_BY_LNR_NAME["Union Bordeaux-Bègles"]).toBe(
      "bordeaux-begles",
    );
  });

  it("reports unknown display names while keeping the remaining fixtures", () => {
    const parsed = parseFixture(
      readFileSync(FIXTURE_PATH, "utf8").replaceAll(
        "Aviron Bayonnais",
        "Unknown Top 14",
      ),
    );

    expect(parsed.matches).toHaveLength(6);
    expect(parsed.unknownTeamNames).toEqual(["Unknown Top 14"]);
  });

  it("uses Europe/Paris for both CEST and CET kickoffs", () => {
    expect(
      parseTop14LnrKickoffAt({
        dateText: "samedi 05 septembre",
        lnrSeason: "2026-2027",
        timeText: "19h05",
      }),
    ).toBe("2026-09-05T17:05:00.000Z");
    expect(
      parseTop14LnrKickoffAt({
        dateText: "samedi 26 décembre",
        lnrSeason: "2026-2027",
        timeText: "19h05",
      }),
    ).toBe("2026-12-26T18:05:00.000Z");
  });
});
