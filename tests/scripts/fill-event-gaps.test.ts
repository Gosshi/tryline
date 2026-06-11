import { describe, expect, it } from "vitest";

import {
  eventTotalsExceedFinalScore,
  extractEventHtml,
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
});
