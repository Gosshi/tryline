import { describe, expect, it } from "vitest";

import { parseNationsChampionshipEventHtml } from "@/lib/ingestion/sources/wikipedia-nations-championship-events";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";
import {
  parseOptions,
  shouldBackfillNationsChampionshipMatch,
} from "@/scripts/backfill-nations-championship-match-events";

const NATIONS_CHAMPIONSHIP_EVENT_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="Japan_v_Italy">
  <table><tbody><tr><td>4 July 2026<br />17:40 JST</td></tr></tbody></table>
  <table><tbody>
    <tr>
      <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
      <td>24–19</td>
      <td class="vcard"><span class="fn org"><a>Italy</a></span></td>
    </tr>
    <tr style="font-size:85%">
      <td>
        <b>Try:</b> <a>Dearns</a> 10' c<br />
        <a>Matsunaga</a> 16' c<br />
        <b>Con:</b> <a>Matsunaga</a> 11', 17'
      </td>
      <td></td>
      <td>
        <b>Try:</b> <a>Brex</a> 22' c<br />
        <b>Con:</b> <a>Garbisi</a> 23'
      </td>
    </tr>
  </tbody></table>
  <table><tbody><tr><td><span class="location">Chichibunomiya Rugby Stadium, Tokyo</span></td></tr></tbody></table>
</div>
`;

const NATIONS_CHAMPIONSHIP_PARSOID_EVENT_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>
<section data-mw-section-id="5" aria-labelledby="Round_1">
  <div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
  <div class="vevent summary" id="Japan_v_Italy">
    <table><tbody><tr><td>4 July 2026<br />17:40 JST</td></tr></tbody></table>
    <table><tbody>
      <tr>
        <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
        <td>24–19</td>
        <td class="vcard"><span class="fn org"><a>Italy</a></span></td>
      </tr>
      <tr style="font-size:85%">
        <td>
          <b>Try:</b> <a>Dearns</a> 10' c<br />
          <a>Matsunaga</a> 16' c<br />
          <b>Con:</b> <a>Matsunaga</a> 11', 17'
        </td>
        <td></td>
        <td>
          <b>Try:</b> <a>Brex</a> 22' c<br />
          <b>Con:</b> <a>Garbisi</a> 23'
        </td>
      </tr>
    </tbody></table>
    <table><tbody><tr><td><span class="location">Chichibunomiya Rugby Stadium, Tokyo</span></td></tr></tbody></table>
  </div>
</section>
`;

describe("Nations Championship event source", () => {
  it("parses sub-article vevent blocks and keeps per-match scoring HTML", () => {
    const matches = parseNationsChampionshipEventHtml(
      NATIONS_CHAMPIONSHIP_EVENT_HTML,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayScore: 19,
      awayTeamSlug: "italy",
      homeScore: 24,
      homeTeamSlug: "japan",
      kickoffAt: "2026-07-04T08:40:00.000Z",
      round: 1,
      status: "finished",
    });

    const events = parseMatchEventsFromVeventHtml(matches[0]!.rawHtml);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minute: 10,
          playerName: "Dearns",
          teamSide: "home",
          type: "try",
        }),
        expect.objectContaining({
          minute: 16,
          playerName: "Matsunaga",
          teamSide: "home",
          type: "try",
        }),
        expect.objectContaining({
          minute: 22,
          playerName: "Brex",
          teamSide: "away",
          type: "try",
        }),
      ]),
    );
  });

  it("extracts match events from Parsoid section-wrapped event pages", () => {
    const matches = parseNationsChampionshipEventHtml(
      NATIONS_CHAMPIONSHIP_PARSOID_EVENT_HTML,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "italy",
      homeTeamSlug: "japan",
      round: 1,
    });

    const events = parseMatchEventsFromVeventHtml(matches[0]!.rawHtml);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minute: 10,
          playerName: "Dearns",
          teamSide: "home",
          type: "try",
        }),
      ]),
    );
  });

  it("parses dry-run, reparse, and owner approval flags", () => {
    expect(parseOptions([])).toEqual({
      dryRun: true,
      ownerApproved: false,
      reparseExisting: false,
    });
    expect(parseOptions(["--reparse-existing"])).toEqual({
      dryRun: true,
      ownerApproved: false,
      reparseExisting: true,
    });
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      dryRun: false,
      ownerApproved: true,
      reparseExisting: false,
    });
  });

  it("defaults to matches without events unless reparse-existing is enabled", () => {
    expect(
      shouldBackfillNationsChampionshipMatch({ match_events: [] }, false),
    ).toBe(true);
    expect(
      shouldBackfillNationsChampionshipMatch(
        { match_events: [{ id: "event-1" }] },
        false,
      ),
    ).toBe(false);
    expect(
      shouldBackfillNationsChampionshipMatch(
        { match_events: [{ id: "event-1" }] },
        true,
      ),
    ).toBe(true);
  });
});
