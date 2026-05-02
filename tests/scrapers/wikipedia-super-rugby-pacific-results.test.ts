import { describe, expect, it } from "vitest";

import { parseSuperRugbyPacificResultsHtml } from "@/lib/scrapers/wikipedia-super-rugby-pacific-results";

const REGULAR_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Round_1">Round 1</h2></div>
<div class="vevent summary" id="Crusaders_v_Hurricanes">
  <table><tbody><tr><td>14 February 2025<br />19:05 (UTC+13)</td></tr></tbody></table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Crusaders</a></span></td>
        <td>33–25</td>
        <td class="vcard"><span class="fn org"><a>Hurricanes</a></span></td>
      </tr>
    </tbody>
  </table>
  <table><tbody><tr><td><span class="location">Apollo Projects Stadium, Christchurch</span></td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading2"><h2 id="Round_3_–_Culture_Round">Round 3 – Culture Round</h2></div>
<div class="vevent summary" id="Moana_Pasifika_v_Highlanders">
  <table><tbody><tr><td>28 February 2025<br />19:05 (UTC+13)</td></tr></tbody></table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Moana Pasifika</a></span></td>
        <td>29-31</td>
        <td class="vcard"><span class="fn org"><a>Highlanders</a></span></td>
      </tr>
    </tbody>
  </table>
  <table><tbody><tr><td><span class="location">North Harbour Stadium, Albany</span></td></tr></tbody></table>
</div>
`;

const SEASON_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Finals_series">Finals series</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Qualifying_finals">Qualifying finals</h3></div>
<div class="vevent summary" id="Crusaders_v_Reds">
  <table><tbody><tr><td>6 June 2025<br />19:05 (UTC+12)</td></tr></tbody></table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Crusaders</a></span></td>
        <td>32–12</td>
        <td class="vcard"><span class="fn org"><a>Reds</a></span></td>
      </tr>
    </tbody>
  </table>
  <table><tbody><tr><td><span class="location">Apollo Projects Stadium, Christchurch</span></td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading3"><h3 id="Semi-finals">Semi-finals</h3></div>
<div class="vevent summary" id="Chiefs_v_Brumbies">
  <table><tbody><tr><td>14 June 2025<br />19:05 (UTC+12)</td></tr></tbody></table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Chiefs</a></span></td>
        <td>37–17</td>
        <td class="vcard"><span class="fn org"><a>Brumbies</a></span></td>
      </tr>
    </tbody>
  </table>
  <table><tbody><tr><td><span class="location">FMG Stadium Waikato, Hamilton</span></td></tr></tbody></table>
</div>
<div class="mw-heading mw-heading3"><h3 id="Final">Final</h3></div>
<div class="vevent summary" id="Crusaders_v_Chiefs">
  <table><tbody><tr><td>21 June 2025<br />19:05 (UTC+12)</td></tr></tbody></table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Crusaders</a></span></td>
        <td>16–12</td>
        <td class="vcard"><span class="fn org"><a>Chiefs</a></span></td>
      </tr>
    </tbody>
  </table>
  <table><tbody><tr><td><span class="location">Apollo Projects Stadium, Christchurch</span></td></tr></tbody></table>
</div>
`;

describe("parseSuperRugbyPacificResultsHtml", () => {
  it("parses regular rounds with decorated heading IDs and finals stages", () => {
    const results = parseSuperRugbyPacificResultsHtml({
      regularHtml: REGULAR_HTML,
      regularSourceUrl:
        "https://example.test/List_of_2025_Super_Rugby_Pacific_matches",
      season: "2025",
      seasonHtml: SEASON_HTML,
      seasonSourceUrl: "https://example.test/2025_Super_Rugby_Pacific_season",
    });

    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({
      away_score: 25,
      away_team_slug: "hurricanes",
      home_score: 33,
      home_team_slug: "crusaders",
      round: 1,
      season: 2025,
      venue: "Apollo Projects Stadium, Christchurch",
      wikipedia_event_id: "Crusaders_v_Hurricanes",
    });
    expect(results[0]?.kickoff_at).toBe("2025-02-14T06:05:00.000Z");
    expect(results[1]).toMatchObject({
      away_team_slug: "highlanders",
      home_team_slug: "moana-pasifika",
      round: 3,
    });
    expect(results[2]).toMatchObject({
      away_team_slug: "reds",
      home_team_slug: "crusaders",
      round: 17,
    });
    expect(results[3]).toMatchObject({
      away_team_slug: "brumbies",
      home_team_slug: "chiefs",
      round: 18,
    });
    expect(results[4]).toMatchObject({
      away_team_slug: "chiefs",
      home_team_slug: "crusaders",
      round: 19,
    });
  });
});
