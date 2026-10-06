import { describe, expect, it } from "vitest";

import { parsePremiershipLiveWikitext } from "@/lib/ingestion/sources/wikipedia-premiership";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import {
  parseUrcLiveHtml,
  parseUrcLiveWikitext,
} from "@/lib/ingestion/sources/wikipedia-urc";

function rugbybox(home: string, away: string, date: string, time: string) {
  return `=== Round 1 ===
{{rugbybox|date=${date}|time=${time}|home=${home}|away=${away}|score=|stadium=Example}}`;
}

describe("date-only Wikipedia fixtures", () => {
  it.each(["", "15:00"])("records availability in URC HTML: %s", (time) => {
    const [match] = parseUrcLiveHtml(
      `<div class="mw-heading"><h3 id="Round_1">Round 1</h3></div><table class="mw-collapsible mw-collapsed"><tr><td>9 October 2026</td><td><a>Leinster</a></td><td>v</td><td><a>Munster</a></td><td>Aviva Stadium</td></tr><tr><td>${time}</td></tr></table>`,
    );
    expect(match?.kickoffTimeTbd).toBe(!time);
  });

  it.each(["", "15:00"])("records the URC time availability: %s", (time) => {
    const [match] = parseUrcLiveWikitext(
      rugbybox("Leinster", "Munster", "9 October 2026", time),
      "2026-27",
    );
    expect(match?.kickoffTimeTbd).toBe(!time);
  });

  it.each(["", "15:00"])(
    "records the Premiership time availability: %s",
    (time) => {
      const [match] = parsePremiershipLiveWikitext(
        rugbybox("Bath", "Bristol Bears", "24 January 2027", time),
      );
      expect(match?.kickoffTimeTbd).toBe(!time);
    },
  );

  it.each(["24 January 2027", "24 April 2027"])(
    "keeps a date-based Premiership ID after the time is announced: %s",
    (date) => {
      const [pending] = parsePremiershipLiveWikitext(
        rugbybox("Bath", "Bristol Bears", date, ""),
      );
      const [confirmed] = parsePremiershipLiveWikitext(
        rugbybox("Bath", "Bristol Bears", date, "15:00"),
      );
      expect(pending?.eventId).toBe(confirmed?.eventId);
      expect(pending?.kickoffAt).not.toBe(confirmed?.kickoffAt);
      expect(pending?.eventId).not.toContain("T00:");
    },
  );

  it.each(["9 October 2026", "9 October 2026 15:00 GMT"])(
    "records availability in the shared parser: %s",
    (date) => {
      const [match] = parseWikipediaSixNationsHtml(
        `<div class="vevent summary"><table><tr><td>${date}</td></tr></table><table><tr><td><a>Japan</a></td><td>v</td><td><a>France</a></td></tr></table></div>`,
      );
      expect(match?.kickoffTimeTbd).toBe(!date.includes("15:00"));
    },
  );
});
