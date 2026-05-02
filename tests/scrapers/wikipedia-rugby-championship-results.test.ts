import { describe, expect, it } from "vitest";

import { parseRugbyChampionshipResultsHtml } from "@/lib/scrapers/wikipedia-rugby-championship-results";

const HTML = `
<div class="mw-heading mw-heading2">
  <h2 id="Fixtures">Fixtures</h2>
</div>
<div class="mw-heading mw-heading3">
  <h3 id="Round_1">Round 1</h3>
</div>
<div class="vevent summary" id="South_Africa_v_Australia">
  <table>
    <tbody>
      <tr>
        <td>16 August 2025<br />17:10 SAST</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>South Africa</a></span></td>
        <td>22-38</td>
        <td class="vcard"><span class="fn org"><a>Australia</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">Ellis Park Stadium, Johannesburg</span></td>
      </tr>
    </tbody>
  </table>
</div>
<div class="mw-heading mw-heading3">
  <h3 id="Round_2">Round 2</h3>
</div>
<div class="vevent summary" id="Argentina_v_New_Zealand">
  <table>
    <tbody>
      <tr>
        <td>23 August 2025<br />18:10 ART</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Argentina</a></span></td>
        <td>29–23</td>
        <td class="vcard"><span class="fn org"><a>New Zealand</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">Estadio Jose Amalfitani, Buenos Aires</span></td>
      </tr>
    </tbody>
  </table>
</div>
`;

describe("parseRugbyChampionshipResultsHtml", () => {
  it("parses finished Rugby Championship vevent blocks into import rows", () => {
    const results = parseRugbyChampionshipResultsHtml(
      HTML,
      "2025",
      "https://example.test/2025_Rugby_Championship",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      away_score: 38,
      away_team_slug: "australia",
      home_score: 22,
      home_team_slug: "south-africa",
      round: 1,
      season: 2025,
      venue: "Ellis Park Stadium, Johannesburg",
      wikipedia_event_id: "South_Africa_v_Australia",
    });
    expect(results[0]?.kickoff_at).toBe("2025-08-16T15:10:00.000Z");
    expect(results[1]).toMatchObject({
      away_team_slug: "new-zealand",
      home_team_slug: "argentina",
      round: 2,
    });
    expect(results[1]?.kickoff_at).toBe("2025-08-23T21:10:00.000Z");
  });
});
