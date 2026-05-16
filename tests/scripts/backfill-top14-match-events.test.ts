import { describe, expect, it } from "vitest";

import {
  buildSeasonEntries,
  matchSeasonEntryToRow,
  parseOptions,
} from "@/scripts/backfill-top14-match-events";

import type { Json } from "@/lib/db/types";

const TOP14_HTML = `
  <div class="mw-heading mw-heading2">
    <h2 id="Playoffs">Playoffs</h2>
  </div>
  <div class="vevent summary" style="width:100%">
    <table style="float:left;width:15%;table-layout:fixed">
      <tbody><tr><td>14 June 2025<br>18:00</td></tr></tbody>
    </table>
    <table style="float:left;width:61%;table-layout:fixed;text-align:center">
      <tbody>
        <tr style="vertical-align:top;font-weight:bold">
          <td class="vcard" style="width:39%;text-align:right"><span class="fn org">Bayonne (4)</span></td>
          <td style="width:22%">20–3</td>
          <td class="vcard" style="width:39%;text-align:left"><span class="fn org">Clermont</span></td>
        </tr>
        <tr style="font-size:85%;vertical-align:top">
          <td style="text-align:right"><b>Try:</b> <a>Tuilagi</a> 23'<br><b>Pen:</b> <a>Segonds</a> 40'</td>
          <td>Report</td>
          <td style="text-align:left"><b>Pen:</b> <a>Urdapilleta</a> 8'</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

describe("backfill-top14-match-events", () => {
  it("parses season and dry-run options", () => {
    expect(parseOptions(["--season=2024-25", "--dry-run"])).toEqual({
      dryRun: true,
      season: "2024-25",
    });
  });

  it("builds season entries with raw vevent html", () => {
    const entries = buildSeasonEntries(TOP14_HTML);

    expect(entries).toEqual([
      expect.objectContaining({
        awayTeamName: "Clermont",
        dateKey: null,
        homeTeamName: "Bayonne",
        rawHtml: expect.stringContaining("Tuilagi"),
        sectionId: "Playoffs",
      }),
    ]);
  });

  it("matches a DB row by section id, teams, and kickoff date", () => {
    const [entry] = buildSeasonEntries(TOP14_HTML);

    const matched = matchSeasonEntryToRow(
      {
        away_team: { name: "ASM Clermont Auvergne" },
        away_team_id: "away-team",
        competition_id: "competition-1",
        external_ids: { wikipedia_event_id: "Playoffs" } as Json,
        home_team: { name: "Aviron Bayonnais" },
        home_team_id: "home-team",
        id: "match-1",
        kickoff_at: "2025-06-14T16:00:00.000Z",
        match_events: [],
      },
      [entry!],
    );

    expect(matched?.homeTeamName).toBe("Bayonne");
    expect(matched?.awayTeamName).toBe("Clermont");
  });
});
