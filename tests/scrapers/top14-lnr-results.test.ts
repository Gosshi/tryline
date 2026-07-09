import { describe, expect, it } from "vitest";

import {
  buildTop14LnrCalendarUrl,
  buildTop14RegularSeasonRoundSlugs,
  parseTop14LnrCalendarHtml,
  resolveTop14TeamsFromLnrSlug,
  toLnrSeason,
} from "@/lib/scrapers/top14-lnr-results";

const CALENDAR_HTML = `
  <article data-venue="Stade Ernest-Wallon">
    <a href="/feuille-de-match/2025-2026/j1/11001-stade-toulousain-asm-clermont-auvergne">Toulouse v Clermont</a>
    <time datetime="2025-09-06T21:05:00+02:00">Samedi 6 septembre 2025 21:05</time>
    <span class="score">31 - 18</span>
  </article>
  <article>
    <a href="https://top14.lnr.fr/feuille-de-match/2025-2026/j1/11002-union-bordeaux-begles-stade-francais-paris">Bordeaux v Paris</a>
    <span class="date">Dimanche 7 septembre 2025</span>
    <span class="time">16h30</span>
    <span class="venue">Stade Chaban-Delmas</span>
    <span class="score">-</span>
  </article>
  <article>
    <a href="/feuille-de-match/2025-2026/j2/11010-toulon-pau">Other round</a>
    <time datetime="2025-09-13T16:30:00+02:00"></time>
  </article>
`;

const REALISH_LNR_SCORE_LINK_HTML = `
  <div class="calendar-results__fixture-date title title--textured">
    samedi 06 septembre
  </div>
  <div class="calendar-results__line">
    <div class="match-calendar-line">
      <div class="match-line">
        <div class="club-line club-line--reversed">
          <a href="https://top14.lnr.fr/club/paris" class="club-line__name">Stade Français Paris</a>
        </div>
        <div class="match-line__score-wrapper">
          <a href="https://top14.lnr.fr/feuille-de-match/2025-2026/j1/11311-paris-montauban" class="match-line__score">
            47 - 24
          </a>
        </div>
        <div class="club-line">
          <a href="https://top14.lnr.fr/club/montauban" class="club-line__name">US Montauban</a>
        </div>
      </div>
    </div>
  </div>
`;

const UNKNOWN_TEAM_HTML = `
  <article>
    <a href="/feuille-de-match/2025-2026/j1/11001-known-unknown">Unknown 1</a>
    <time datetime="2025-09-06T21:05:00+02:00"></time>
  </article>
  <article>
    <a href="/feuille-de-match/2025-2026/j1/11002-also-missing">Unknown 2</a>
    <time datetime="2025-09-06T21:05:00+02:00"></time>
  </article>
`;

describe("top14-lnr-results", () => {
  it("builds regular-season LNR URLs", () => {
    expect(toLnrSeason("2025-26")).toBe("2025-2026");
    expect(buildTop14RegularSeasonRoundSlugs()).toHaveLength(26);
    expect(buildTop14RegularSeasonRoundSlugs()[0]).toBe("j1");
    expect(buildTop14RegularSeasonRoundSlugs()[25]).toBe("j26");
    expect(buildTop14LnrCalendarUrl("2025-26", "j24")).toBe(
      "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j24",
    );
  });

  it("resolves LNR match slug pairs to Tryline team slugs", () => {
    expect(
      resolveTop14TeamsFromLnrSlug(
        "union-bordeaux-begles-stade-francais-paris",
      ),
    ).toEqual({
      awaySlug: "stade-francais",
      homeSlug: "bordeaux-begles",
    });
  });

  it("parses regular-season match basics from LNR calendar HTML", () => {
    const matches = parseTop14LnrCalendarHtml({
      html: CALENDAR_HTML,
      roundSlug: "j1",
      season: "2025-26",
      sourceUrl: "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j1",
    });

    expect(matches).toEqual([
      {
        away_score: 18,
        away_team_slug: "clermont",
        home_score: 31,
        home_team_slug: "toulouse",
        kickoff_at: "2025-09-06T19:05:00.000Z",
        lnr_id: "11001",
        lnr_match_path:
          "/feuille-de-match/2025-2026/j1/11001-stade-toulousain-asm-clermont-auvergne",
        round: 1,
        round_slug: "j1",
        season: "2025-26",
        source_url: "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j1",
        status: "finished",
        venue: "Stade Ernest-Wallon",
      },
      {
        away_score: null,
        away_team_slug: "stade-francais",
        home_score: null,
        home_team_slug: "bordeaux-begles",
        kickoff_at: "2025-09-07T14:30:00.000Z",
        lnr_id: "11002",
        lnr_match_path:
          "/feuille-de-match/2025-2026/j1/11002-union-bordeaux-begles-stade-francais-paris",
        round: 1,
        round_slug: "j1",
        season: "2025-26",
        source_url: "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j1",
        status: "scheduled",
        venue: "Stade Chaban-Delmas",
      },
    ]);
  });

  it("parses finished score links from real-ish LNR calendar rows", () => {
    const matches = parseTop14LnrCalendarHtml({
      html: REALISH_LNR_SCORE_LINK_HTML,
      roundSlug: "j1",
      season: "2025-26",
      sourceUrl: "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j1",
    });

    expect(matches).toEqual([
      expect.objectContaining({
        away_score: 24,
        away_team_slug: "us-montauban",
        home_score: 47,
        home_team_slug: "stade-francais",
        kickoff_at: "2025-09-06T00:00:00.000Z",
        lnr_id: "11311",
        status: "finished",
        venue: null,
      }),
    ]);
  });

  it("reports all unknown LNR team slug pairs in a round", () => {
    expect(() =>
      parseTop14LnrCalendarHtml({
        html: UNKNOWN_TEAM_HTML,
        roundSlug: "j1",
        season: "2025-26",
        sourceUrl: "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j1",
      }),
    ).toThrow(
      "Unknown Top 14 LNR team slug pair(s): known-unknown, also-missing",
    );
  });
});
