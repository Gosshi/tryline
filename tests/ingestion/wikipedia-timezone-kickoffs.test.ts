import { describe, expect, it } from "vitest";

import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import kickoffs from "@/tests/fixtures/wikipedia-timezone-kickoffs.json";

describe("timezone abbreviations observed in ingestion fixtures and Wikipedia", () => {
  it.each(kickoffs)(
    "$abbreviation in $city at $dateText $timeText → $expectedUtc",
    ({ abbreviation, city, dateText, timeText, expectedUtc }) => {
      const html = `<div class="vevent summary" id="Home_v_Away">
        <table><tr><td>${dateText}<br>${timeText} ${abbreviation}</td></tr></table>
        <table><tr><td><a>Home</a></td><td>v</td><td><a>Away</a></td></tr></table>
        <span class="location">Stadium, ${city}</span>
      </div>`;

      expect(parseWikipediaSixNationsHtml(html)[0]?.kickoffAt).toBe(
        expectedUtc,
      );
    },
  );
});
