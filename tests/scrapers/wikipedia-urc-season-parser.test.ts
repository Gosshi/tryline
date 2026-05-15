import { describe, expect, it } from "vitest";

import { parseWikipediaUrcSeasonMatches } from "@/lib/scrapers/wikipedia-urc-season-parser";

const urcSeasonHtml = `
<div class="mw-heading mw-heading3"><h3 id="Round_2">Round 2</h3></div>
<table class="mw-collapsible mw-collapsed">
  <tbody>
    <tr>
      <td>3 October 2025</td>
      <td style="text-align:right"><b><a>Munster</a></b></td>
      <td style="text-align:center"><b>20 – 17</b></td>
      <td style="text-align:left"><b><a>Scarlets</a></b></td>
      <td>Thomond Park</td>
    </tr>
    <tr style="font-size:85%">
      <td>20:00</td>
      <td></td>
      <td>Report</td>
      <td></td>
      <td>Attendance</td>
    </tr>
  </tbody>
</table>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<table class="mw-collapsible mw-collapsed">
  <tbody>
    <tr>
      <td>26 September 2025</td>
      <td style="text-align:right"><b>(1 BP) <a>Stormers</a></b></td>
      <td style="text-align:center"><b>35 – 0</b></td>
      <td style="text-align:left"><b><a>Leinster</a></b></td>
      <td>Cape Town Stadium</td>
    </tr>
    <tr style="font-size:85%">
      <td>18:00</td>
      <td></td>
      <td>Report</td>
      <td></td>
      <td>Attendance</td>
    </tr>
    <tr>
      <td>27 September 2025</td>
      <td style="text-align:right"><b><a>Zebre</a></b></td>
      <td style="text-align:center"><b>12-18</b></td>
      <td style="text-align:left"><b><a>Cardiff</a></b></td>
      <td>Parma</td>
    </tr>
    <tr style="font-size:85%">
      <td>13:00</td>
      <td></td>
      <td>Report</td>
      <td></td>
      <td>Attendance</td>
    </tr>
  </tbody>
</table>
`;

describe("Wikipedia URC season parser", () => {
  it("parses round tables into matches with synthetic event ids", () => {
    expect(parseWikipediaUrcSeasonMatches(urcSeasonHtml)).toEqual([
      {
        awayTeamName: "Leinster",
        dateKey: "2025-09-26",
        dateText: "26 September 2025",
        homeTeamName: "Stormers",
        sectionId: "Round_1_0",
      },
      {
        awayTeamName: "Cardiff",
        dateKey: "2025-09-27",
        dateText: "27 September 2025",
        homeTeamName: "Zebre",
        sectionId: "Round_1_1",
      },
      {
        awayTeamName: "Scarlets",
        dateKey: "2025-10-03",
        dateText: "3 October 2025",
        homeTeamName: "Munster",
        sectionId: "Round_2_0",
      },
    ]);
  });
});
