import { describe, expect, it } from "vitest";

import { parsePacificNationsCupResultsHtml } from "@/lib/scrapers/wikipedia-pacific-nations-cup-results";

const HTML = `
<div class="mw-heading mw-heading2">
  <h2 id="Pool_stage">Pool stage</h2>
</div>
<div class="vevent summary" id="Tonga_v_Samoa">
  <table>
    <tbody>
      <tr>
        <td>23 August 2025<br />15:00 TOT (UTC+13)</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Tonga</a></span></td>
        <td>30–16</td>
        <td class="vcard"><span class="fn org"><a>Samoa</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">Teufaiva Sport Stadium, Nukuʻalofa</span></td>
      </tr>
    </tbody>
  </table>
</div>
<div class="mw-heading mw-heading2">
  <h2 id="Finals_series">Finals series</h2>
</div>
<div class="vevent summary" id="United_States_v_Japan">
  <table>
    <tbody>
      <tr>
        <td>6 September 2025<br />18:00 PDT (UTC-7)</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>United States</a></span></td>
        <td>21-47</td>
        <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">Heart Health Park, Sacramento</span></td>
      </tr>
    </tbody>
  </table>
</div>
`;

describe("parsePacificNationsCupResultsHtml", () => {
  it("parses Pacific Nations Cup vevent blocks outside a Fixtures section", () => {
    const results = parsePacificNationsCupResultsHtml(
      HTML,
      "2025",
      "https://example.test/2025_World_Rugby_Pacific_Nations_Cup",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      away_score: 16,
      away_team_slug: "samoa",
      home_score: 30,
      home_team_slug: "tonga",
      round: null,
      season: 2025,
      venue: "Teufaiva Sport Stadium, Nukuʻalofa",
      wikipedia_event_id: "Tonga_v_Samoa",
    });
    expect(results[0]?.kickoff_at).toBe("2025-08-23T02:00:00.000Z");
    expect(results[1]).toMatchObject({
      away_team_slug: "japan",
      home_team_slug: "usa",
    });
    expect(results[1]?.kickoff_at).toBe("2025-09-07T01:00:00.000Z");
  });
});
