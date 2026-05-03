import { describe, expect, it } from "vitest";

import { parseTop14ResultsHtml } from "@/lib/scrapers/wikipedia-top-14-results";

const HTML = `
<div class="mw-heading mw-heading2"><h2 id="Relegation_play-off">Relegation play-off</h2></div>
<div class="vevent summary" id="Grenoble_v_Perpignan">
  <table><tbody><tr><td>14 June 2025<br />18:00</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Grenoble</a></span></td>
    <td>11–13</td>
    <td class="vcard"><span class="fn org"><a>Perpignan</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Stade des Alpes</span><br />Attendance: 19,695</td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading2"><h2 id="Playoffs">Playoffs</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Semi-final_Qualifiers">Semi-final Qualifiers</h3></div>
<div class="vevent summary" id="Bayonne_v_Clermont">
  <table><tbody><tr><td>13 June 2025<br />21:05</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Bayonne</a> (4)</span></td>
    <td>20–3</td>
    <td class="vcard"><span class="fn org">(5) <a>Clermont</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Stade Jean-Dauger</span><br />Attendance: 13,507</td></tr></tbody></table>
</div>
<div class="vevent summary" id="Toulon_v_Castres">
  <table><tbody><tr><td>14 June 2025<br />21:05</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Toulon</a> (3)</span></td>
    <td>52–23</td>
    <td class="vcard"><span class="fn org">(6) <a>Castres</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Stade Mayol</span><br />Attendance: 15,364</td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading3"><h3 id="Semi-finals">Semi-finals</h3></div>
<div class="vevent summary" id="Toulouse_v_Bayonne">
  <table><tbody><tr><td>20 June 2025<br />21:05</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Toulouse</a> (1)</span></td>
    <td>32–25</td>
    <td class="vcard"><span class="fn org">(4) <a>Bayonne</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Parc Olympique Lyonnais, Décines-Charpieu</span><br />Attendance: 58,741</td></tr></tbody></table>
</div>
<div class="vevent summary" id="Bordeaux_v_Toulon">
  <table><tbody><tr><td>21 June 2025<br />21:05</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Bordeaux Bègles</a> (2)</span></td>
    <td>39–24</td>
    <td class="vcard"><span class="fn org">(3) <a>Toulon</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Parc Olympique Lyonnais, Décines-Charpieu</span><br />Attendance: 58,408</td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading3"><h3 id="Final">Final</h3></div>
<div class="vevent summary" id="Toulouse_v_Bordeaux">
  <table><tbody><tr><td>28 June 2025<br />21:05</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Toulouse</a> (1)</span></td>
    <td>39–33 (a.e.t.)</td>
    <td class="vcard"><span class="fn org">(2) <a>Bordeaux Bègles</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Stade de France, Saint-Denis</span><br />Attendance: 78,000</td></tr></tbody></table>
</div>
`;

describe("parseTop14ResultsHtml", () => {
  it("parses Top 14 relegation and playoff sections", () => {
    const results = parseTop14ResultsHtml(
      HTML,
      "2024-25",
      "https://example.test/2024-25_Top_14_season",
    );

    expect(results).toHaveLength(6);
    expect(results[0]).toMatchObject({
      away_score: 13,
      away_team_slug: "perpignan",
      home_score: 11,
      home_team_slug: "grenoble",
      round: 0,
      season: "2024-25",
      venue: "Stade des Alpes",
      wikipedia_event_id: "Grenoble_v_Perpignan",
    });
    expect(results[0]?.kickoff_at).toBe("2025-06-14T16:00:00.000Z");
    expect(results[3]).toMatchObject({
      away_team_slug: "bayonne",
      home_team_slug: "toulouse",
      round: 2,
    });
    expect(results[5]).toMatchObject({
      away_team_slug: "bordeaux-begles",
      home_team_slug: "toulouse",
      round: 3,
    });
    expect(results[5]?.kickoff_at).toBe("2025-06-28T19:05:00.000Z");
  });
});
