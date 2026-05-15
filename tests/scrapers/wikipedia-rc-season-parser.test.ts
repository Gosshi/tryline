import { describe, expect, it } from "vitest";

import {
  extractWikipediaRcMatchFragment,
  parseWikipediaRcSeasonMatches,
} from "@/lib/scrapers/wikipedia-rc-season-parser";

const rcSeasonHtml = `
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<p>16 August 2025</p>
<table>
  <tr>
    <td><a>South Africa</a></td>
    <td>22–38</td>
    <td><a>Australia</a></td>
  </tr>
</table>
<p>Try: Player A (4')</p>
<hr>
<p>16 August 2025</p>
<table>
  <tr>
    <td><a>Argentina</a></td>
    <td>24-41</td>
    <td><a>New Zealand</a></td>
  </tr>
</table>
<div class="mw-heading mw-heading3"><h3 id="Round_2">Round 2</h3></div>
<p>23 August 2025</p>
<table>
  <tr>
    <td><a>Australia</a></td>
    <td>30-22</td>
    <td><a>South Africa</a></td>
  </tr>
</table>
`;

describe("Wikipedia Rugby Championship season parser", () => {
  it("splits round sections by hr and emits synthetic event ids", () => {
    expect(parseWikipediaRcSeasonMatches(rcSeasonHtml)).toEqual([
      {
        awayTeamName: "Australia",
        dateKey: "2025-08-16",
        dateText: "16 August 2025",
        homeTeamName: "South Africa",
        sectionId: "Round_1_0",
      },
      {
        awayTeamName: "New Zealand",
        dateKey: "2025-08-16",
        dateText: "16 August 2025",
        homeTeamName: "Argentina",
        sectionId: "Round_1_1",
      },
      {
        awayTeamName: "South Africa",
        dateKey: "2025-08-23",
        dateText: "23 August 2025",
        homeTeamName: "Australia",
        sectionId: "Round_2_0",
      },
    ]);
  });

  it("extracts a specific match fragment by synthetic event id", () => {
    const fragment = extractWikipediaRcMatchFragment(rcSeasonHtml, "Round_1_1");

    expect(fragment).toContain("Argentina");
    expect(fragment).toContain("New Zealand");
    expect(fragment).not.toContain("South Africa");
  });
});
