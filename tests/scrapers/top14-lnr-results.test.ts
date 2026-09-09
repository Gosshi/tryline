import { load } from "cheerio";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildTop14LnrCalendarUrl,
  buildTop14LnrCurrentCalendarUrl,
  parseTop14LnrCalendarHtmlWithDiagnostics,
  parseTop14LnrCurrentRoundSlug,
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
    expect(buildTop14LnrCurrentCalendarUrl(SEASON)).toBe(
      "https://top14.lnr.fr/calendrier-et-resultats/2026-2027",
    );
  });

  it("finds the current round from an official match link", () => {
    const html = readFileSync(FIXTURE_PATH, "utf8");

    expect(
      parseTop14LnrCurrentRoundSlug({ html, season: SEASON }),
    ).toBe("j1");
    expect(
      parseTop14LnrCurrentRoundSlug({
        html: html.replaceAll("/j1/", "/finale/"),
        season: SEASON,
      }),
    ).toBe("finale");
  });

  it("parses all seven scored J1 fixtures from the captured LNR page", () => {
    const parsed = parseFixture();

    expect(parsed.unknownTeamNames).toEqual([]);
    expect(parsed.diagnostics).toEqual({
      datesFound: 7,
      fixtureElements: 7,
      matchesReturned: 7,
      teamsResolved: 7,
      timesFound: 0,
    });
    expect(parsed.matches).toHaveLength(7);
    expect(parsed.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          away_score: 26,
          away_team_slug: "toulon",
          home_score: 27,
          home_team_slug: "bayonne",
          kickoff_at: null,
          lnr_id: "11819",
          status: "finished",
        }),
        expect.objectContaining({
          away_score: 27,
          home_score: 30,
          kickoff_at: null,
          lnr_id: "11822",
          status: "finished",
        }),
      ]),
    );
  });

  it("assigns each fixture the nearest date when a captured round spans multiple days", () => {
    const $ = load(readFileSync(FIXTURE_PATH, "utf8"));

    $(".match-calendar-line").each((index, element) => {
      const time = index === 6 ? "21h05" : "19h05";
      $(element)
        .find(".match-line__result")
        .first()
        .prepend(`<p class="match-line__time">${time}</p>`);
    });

    const parsed = parseFixture($.html());

    expect(
      parsed.matches.find((match) => match.lnr_id === "11819")?.kickoff_at,
    ).toBe("2026-09-05T17:05:00.000Z");
    expect(
      parsed.matches.find((match) => match.lnr_id === "11822")?.kickoff_at,
    ).toBe("2026-09-06T19:05:00.000Z");
  });

  it("keeps scored fixtures when the captured calendar has no kickoff times", () => {
    const parsed = parseFixture();

    expect(parsed.diagnostics).toEqual({
      datesFound: 7,
      fixtureElements: 7,
      matchesReturned: 7,
      teamsResolved: 7,
      timesFound: 0,
    });
    expect(parsed.matches).toHaveLength(7);
    expect(parsed.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          away_score: 26,
          home_score: 27,
          kickoff_at: null,
          lnr_id: "11819",
          status: "finished",
        }),
      ]),
    );
  });

  it("warns with diagnostics when fixture elements yield no matches", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let html = readFileSync(FIXTURE_PATH, "utf8");

    Object.keys(TOP14_TEAM_SLUG_BY_LNR_NAME).forEach((name, index) => {
      html = html.replaceAll(name, `Unknown Top 14 ${index + 1}`);
    });

    const parsed = parseFixture(html);

    expect(parsed.matches).toEqual([]);
    expect(warn).toHaveBeenCalledWith("[top14-lnr] no fixtures parsed", {
      datesFound: 7,
      fixtureElements: 7,
      matchesReturned: 0,
      teamsResolved: 0,
      timesFound: 0,
    });

    warn.mockRestore();
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
