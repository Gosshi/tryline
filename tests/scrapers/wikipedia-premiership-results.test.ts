import { describe, expect, it } from "vitest";

import { parsePremiershipResultsHtml } from "@/lib/scrapers/wikipedia-premiership-results";

const HTML = `
<div class="mw-heading mw-heading2">
  <h2 id="Regular_season">Regular season</h2>
</div>
<div class="mw-heading mw-heading3">
  <h3 id="Round_1">Round 1</h3>
</div>
<div class="vevent summary" id="Bath_v_Northampton_Saints">
  <table>
    <tbody>
      <tr>
        <td>20 September 2024<br />19:45</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Bath</a></span></td>
        <td>38–16</td>
        <td class="vcard"><span class="fn org"><a>Northampton Saints</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">The Recreation Ground</span></td>
      </tr>
    </tbody>
  </table>
</div>
<div class="mw-heading mw-heading3">
  <h3 id="Round_11">Round 11</h3>
</div>
<div class="vevent summary" id="Saracens_v_Bristol_Bears">
  <table>
    <tbody>
      <tr>
        <td>4 January 2025<br />17:30</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Saracens</a></span></td>
        <td>35-26</td>
        <td class="vcard"><span class="fn org"><a>Bristol Bears</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">StoneX Stadium</span></td>
      </tr>
    </tbody>
  </table>
</div>
<div class="mw-heading mw-heading2">
  <h2 id="Play-offs">Play-offs</h2>
</div>
<div class="vevent summary" id="Bath_v_Playoff_Team">
  <table>
    <tbody>
      <tr>
        <td>7 June 2025<br />15:30</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Bath</a></span></td>
        <td>34–20</td>
        <td class="vcard"><span class="fn org"><a>Sale Sharks</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">The Recreation Ground</span></td>
      </tr>
    </tbody>
  </table>
</div>
`;

describe("parsePremiershipResultsHtml", () => {
  it("parses regular season Premiership vevent blocks and skips play-offs", () => {
    const results = parsePremiershipResultsHtml(
      HTML,
      "2024-25",
      "https://example.test/2024-25_Premiership_Rugby",
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      away_score: 16,
      away_team_slug: "northampton-saints",
      home_score: 38,
      home_team_slug: "bath",
      round: 1,
      season: "2024-25",
      venue: "The Recreation Ground",
      wikipedia_event_id: "Bath_v_Northampton_Saints",
    });
    expect(results[0]?.kickoff_at).toBe("2024-09-20T18:45:00.000Z");
    expect(results[1]).toMatchObject({
      away_team_slug: "bristol-bears",
      home_team_slug: "saracens",
      round: 11,
    });
    expect(results[1]?.kickoff_at).toBe("2025-01-04T17:30:00.000Z");
  });
});
