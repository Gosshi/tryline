import { describe, expect, it } from "vitest";

import { parseAutumnNationsResultsHtml } from "@/lib/scrapers/wikipedia-autumn-nations-results";

const HTML = `
<div class="mw-heading mw-heading2">
  <h2 id="Fixtures">Fixtures</h2>
</div>
<div class="mw-heading mw-heading3">
  <h3 id="Round_1">Round 1</h3>
</div>
<div class="vevent summary" id="England_v_New_Zealand">
  <table>
    <tbody>
      <tr>
        <td>1 November 2025<br />15:10 GMT</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>England</a></span></td>
        <td>24–20</td>
        <td class="vcard"><span class="fn org"><a>New Zealand</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">Twickenham Stadium, London</span></td>
      </tr>
    </tbody>
  </table>
</div>
<div class="vevent summary" id="France_v_South_Africa">
  <table>
    <tbody>
      <tr>
        <td>8 November 2025<br />21:10 CET</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>France</a></span></td>
        <td>17-32</td>
        <td class="vcard"><span class="fn org"><a>South Africa</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">Stade de France, Saint-Denis</span></td>
      </tr>
    </tbody>
  </table>
</div>
`;

describe("parseAutumnNationsResultsHtml", () => {
  it("parses finished Autumn Nations vevent blocks into import rows", () => {
    const results = parseAutumnNationsResultsHtml(
      HTML,
      "2025",
      "https://example.test/2025_Autumn_Nations_Series",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      away_score: 20,
      away_team_slug: "new-zealand",
      home_score: 24,
      home_team_slug: "england",
      round: 1,
      season: 2025,
      venue: "Twickenham Stadium, London",
      wikipedia_event_id: "England_v_New_Zealand",
    });
    expect(results[0]?.kickoff_at).toBe("2025-11-01T15:10:00.000Z");
    expect(results[1]).toMatchObject({
      away_team_slug: "south-africa",
      home_team_slug: "france",
    });
    expect(results[1]?.kickoff_at).toBe("2025-11-08T20:10:00.000Z");
  });
});
