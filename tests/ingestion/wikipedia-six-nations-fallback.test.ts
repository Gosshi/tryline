import { describe, expect, it } from "vitest";

import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";

const HTML_WITHOUT_FIXTURES_SECTION = `
<div class="vevent summary" id="Japan_v_Fiji">
  <table>
    <tbody>
      <tr>
        <td>2 November 2025<br />14:00 GMT</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
        <td>28–24</td>
        <td class="vcard"><span class="fn org"><a>Fiji</a></span></td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td><span class="location">National Stadium, Tokyo</span></td>
      </tr>
    </tbody>
  </table>
</div>
`;

const HTML_WITHOUT_ANCHORS = `
<div class="vevent summary" id="Japan_v_UK_Armed_Forces_XV">
  <table>
    <tbody>
      <tr>
        <td>9 November 2025<br />14:00 GMT</td>
      </tr>
    </tbody>
  </table>
  <table>
    <tbody>
      <tr>
        <td class="vcard"><span class="fn org">Japan</span></td>
        <td>35–10</td>
        <td class="vcard"><span class="fn org">UK Armed Forces XV</span></td>
      </tr>
    </tbody>
  </table>
</div>
`;

const PARSOID_FIXTURES_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
<p>Fixture introduction.</p>
<section data-mw-section-id="5" aria-labelledby="Round_1">
  <div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
  <div class="vevent summary" id="Japan_v_Italy">
    <table>
      <tbody>
        <tr>
          <td>4 July 2026<br />17:40 JST</td>
        </tr>
      </tbody>
    </table>
    <table>
      <tbody>
        <tr>
          <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
          <td>24–19</td>
          <td class="vcard"><span class="fn org"><a>Italy</a></span></td>
        </tr>
      </tbody>
    </table>
    <table>
      <tbody>
        <tr>
          <td><span class="location">Chichibunomiya Rugby Stadium, Tokyo</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</section>
<div class="mw-heading mw-heading2"><h2 id="See_also">See also</h2></div>
<div class="vevent summary" id="Should_not_parse">
  <table><tbody><tr><td>5 July 2026<br />14:00 GMT</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>England</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>France</a></span></td>
  </tr></tbody></table>
</div>
`;

describe("parseWikipediaSixNationsHtml fallback", () => {
  it("parses vevent summary blocks even when the Fixtures heading is absent", () => {
    const matches = parseWikipediaSixNationsHtml(
      HTML_WITHOUT_FIXTURES_SECTION,
    );

    expect(matches).toEqual([
      expect.objectContaining({
        awayScore: 24,
        awayTeamName: "Fiji",
        eventId: "Japan_v_Fiji",
        homeScore: 28,
        homeTeamName: "Japan",
        round: null,
        status: "finished",
        venue: "National Stadium, Tokyo",
      }),
    ]);
    expect(matches[0]?.kickoffAt).toBe("2025-11-02T14:00:00.000Z");
  });

  it("falls back to .fn text when a vevent team cell has no anchor tag", () => {
    const matches = parseWikipediaSixNationsHtml(HTML_WITHOUT_ANCHORS);

    expect(matches).toEqual([
      expect.objectContaining({
        awayTeamName: "UK Armed Forces XV",
        homeTeamName: "Japan",
      }),
    ]);
  });

  it("parses Parsoid section-wrapped round vevents after the Fixtures heading", () => {
    const matches = parseWikipediaSixNationsHtml(PARSOID_FIXTURES_HTML);

    expect(matches).toEqual([
      expect.objectContaining({
        awayScore: 19,
        awayTeamName: "Italy",
        eventId: "Japan_v_Italy",
        homeScore: 24,
        homeTeamName: "Japan",
        round: 1,
        status: "finished",
        venue: "Chichibunomiya Rugby Stadium, Tokyo",
      }),
    ]);
    expect(matches[0]?.kickoffAt).toBe("2026-07-04T08:40:00.000Z");
  });
});
