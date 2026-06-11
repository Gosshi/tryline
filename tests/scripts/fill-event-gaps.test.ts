import { describe, expect, it } from "vitest";

import {
  eventTotalsExceedFinalScore,
  extractEventHtml,
  findEventBlockByTeams,
} from "@/scripts/fill-event-gaps";

import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

const HTML = `
  <html>
    <body>
      <div id="first">first match</div>
      <div id="target"><table><tr><td>target match</td></tr></table></div>
    </body>
  </html>
`;

const VEVENT_HTML = `
  <html>
    <body>
      <div class="vevent summary">
        <div>1 November 2025</div>
        <a href="/wiki/England_national_rugby_union_team">England</a>
        <a href="/wiki/Australia_national_rugby_union_team">Australia</a>
        <table><tr><td>England v Australia events</td></tr></table>
      </div>
      <div class="vevent summary">
        <div>8 November 2025</div>
        <a href="/wiki/France_national_rugby_union_team">France</a>
        <a href="/wiki/Australia_national_rugby_union_team">Australia</a>
        <table><tr><td>France v Australia events</td></tr></table>
      </div>
    </body>
  </html>
`;

const DUPLICATE_TEAMS_HTML = `
  <html>
    <body>
      <div class="vevent summary">
        <div>1 November 2025</div>
        <a>England</a>
        <a>Australia</a>
        <table><tr><td>first match</td></tr></table>
      </div>
      <div class="vevent summary">
        <div>8 November 2025</div>
        <a>England</a>
        <a>Australia</a>
        <table><tr><td>second match</td></tr></table>
      </div>
    </body>
  </html>
`;

describe("fill-event-gaps safeguards", () => {
  it("extracts the matching event anchor html", () => {
    const html = extractEventHtml(HTML, "target");

    expect(html).toContain("target match");
    expect(html).not.toContain("first match");
  });

  it("returns null for missing, generic, or absent event ids", () => {
    expect(extractEventHtml(HTML, "missing")).toBeNull();
    expect(extractEventHtml(HTML, "mw-content-text")).toBeNull();
    expect(extractEventHtml(HTML, null)).toBeNull();
  });

  it("detects parsed event totals that exceed the final score", () => {
    const events: ParsedMatchEvent[] = [
      {
        isPenaltyTry: false,
        minute: 10,
        playerName: "Try Scorer",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 11,
        playerName: "Kicker",
        teamSide: "home",
        type: "conversion",
      },
    ];

    expect(
      eventTotalsExceedFinalScore(events, {
        away_score: 0,
        home_score: 5,
      }),
    ).toEqual({
      awayTotal: 0,
      exceeds: true,
      homeTotal: 7,
    });
  });

  it("allows normal data and null final scores", () => {
    const events: ParsedMatchEvent[] = [
      {
        isPenaltyTry: false,
        minute: 10,
        playerName: "Try Scorer",
        teamSide: "away",
        type: "try",
      },
    ];

    expect(
      eventTotalsExceedFinalScore(events, {
        away_score: 7,
        home_score: 0,
      }).exceeds,
    ).toBe(false);
    expect(
      eventTotalsExceedFinalScore(events, {
        away_score: null,
        home_score: null,
      }).exceeds,
    ).toBe(false);
  });

  it("selects the only vevent that contains both team names", () => {
    const html = findEventBlockByTeams(
      VEVENT_HTML,
      "England",
      "Australia",
      "2025-11-01",
    );

    expect(html).toContain("England v Australia events");
    expect(html).not.toContain("France v Australia events");
  });

  it("returns null when no vevent contains both team names", () => {
    expect(
      findEventBlockByTeams(VEVENT_HTML, "England", "Japan", "2025-11-01"),
    ).toBeNull();
  });

  it("uses the kickoff date to disambiguate repeated team matchups", () => {
    const html = findEventBlockByTeams(
      DUPLICATE_TEAMS_HTML,
      "England",
      "Australia",
      "2025-11-08",
    );

    expect(html).toContain("second match");
    expect(html).not.toContain("first match");
  });

  it("returns null when repeated team matchups cannot be disambiguated by date", () => {
    expect(
      findEventBlockByTeams(
        DUPLICATE_TEAMS_HTML,
        "England",
        "Australia",
        "2025-11-04",
      ),
    ).toBeNull();
  });
});
