import { describe, expect, it, vi } from "vitest";

import { parseNationsChampionshipEventHtml } from "@/lib/ingestion/sources/wikipedia-nations-championship-events";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";
import {
  buildEventMatchLookup,
  computeEventPointTotals,
  eventTotalsMatchFinalScore,
  parseOptions,
  runBackfillNationsChampionshipMatchEvents,
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

const NATIONS_CHAMPIONSHIP_SECOND_EVENT_HTML = `
<div class="vevent summary" id="New_Zealand_v_France">
  <table><tbody><tr><td>4 July 2026<br />19:05 NZST</td></tr></tbody></table>
  <table><tbody>
    <tr>
      <td class="vcard"><span class="fn org"><a>New Zealand</a></span></td>
      <td>34–32</td>
      <td class="vcard"><span class="fn org"><a>France</a></span></td>
    </tr>
    <tr style="font-size:85%">
      <td><b>Try:</b> <a>Jordan</a> 10'</td>
      <td></td>
      <td><b>Try:</b> <a>Penaud</a> 12'</td>
    </tr>
  </tbody></table>
</div>
`;

const scoringEvent = (params: {
  isPenaltyTry?: boolean;
  teamSide: "home" | "away";
  type: "conversion" | "drop_goal" | "penalty_goal" | "try";
}) => ({
  isPenaltyTry: params.isPenaltyTry ?? false,
  minute: 10,
  playerName: "Scorer",
  teamSide: params.teamSide,
  type: params.type,
});

function createDb(matches: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: async () => ({ data: matches, error: null }),
          }),
        }),
      }),
    }),
  } as any;
}

const parsedMatch = (params: {
  awayTeamSlug: string;
  homeTeamSlug: string;
  rawHtml: string;
}) =>
  ({
    awayScore: null,
    awayTeamName: params.awayTeamSlug,
    awayTeamSlug: params.awayTeamSlug,
    eventId: null,
    homeScore: null,
    homeTeamName: params.homeTeamSlug,
    homeTeamSlug: params.homeTeamSlug,
    kickoffAt: "2026-07-04T00:00:00.000Z",
    lineupTableHtml: null,
    rawHtml: params.rawHtml,
    round: 1,
    roundName: null,
    status: "finished",
    venue: null,
  }) as any;

const matchRow = (params: {
  awayScore: number;
  awaySlug: string;
  homeScore: number;
  homeSlug: string;
}) => ({
  away_score: params.awayScore,
  away_team: { name: params.awaySlug, slug: params.awaySlug },
  away_team_id: "away-team-id",
  external_ids: {},
  home_score: params.homeScore,
  home_team: { name: params.homeSlug, slug: params.homeSlug },
  home_team_id: "home-team-id",
  id: "match-id",
  match_events: [],
});

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

  it("keeps raw HTML isolated for multiple finished matches", () => {
    const matches = parseNationsChampionshipEventHtml(
      `${NATIONS_CHAMPIONSHIP_EVENT_HTML}${NATIONS_CHAMPIONSHIP_SECOND_EVENT_HTML}`,
    );

    expect(matches).toHaveLength(2);
    expect(
      matches.map((match) => `${match.homeTeamSlug}:${match.awayTeamSlug}`),
    ).toEqual(["japan:italy", "new-zealand:france"]);
    expect(matches[0]!.rawHtml).toContain("Japan_v_Italy");
    expect(matches[0]!.rawHtml).not.toContain("New_Zealand_v_France");
    expect(matches[1]!.rawHtml).toContain("New_Zealand_v_France");
  });

  it("marks duplicate team-pair event matches as ambiguous", () => {
    const lookup = buildEventMatchLookup([
      parsedMatch({
        awayTeamSlug: "france",
        homeTeamSlug: "new-zealand",
        rawHtml: "first",
      }),
      parsedMatch({
        awayTeamSlug: "france",
        homeTeamSlug: "new-zealand",
        rawHtml: "second",
      }),
    ]);

    expect(lookup.get("new-zealand:france")).toMatchObject({
      matches: [
        expect.objectContaining({ rawHtml: "first" }),
        expect.objectContaining({ rawHtml: "second" }),
      ],
      status: "ambiguous",
    });
  });

  it("computes event point totals with penalty tries and ignores non-scoring events", () => {
    const totals = computeEventPointTotals([
      scoringEvent({ teamSide: "home", type: "try" }),
      scoringEvent({ teamSide: "home", type: "conversion" }),
      scoringEvent({ isPenaltyTry: true, teamSide: "away", type: "try" }),
      scoringEvent({ teamSide: "away", type: "penalty_goal" }),
      scoringEvent({ teamSide: "away", type: "drop_goal" }),
      {
        isPenaltyTry: false,
        minute: 22,
        playerName: "Carded",
        teamSide: "home",
        type: "yellow_card",
      },
    ]);

    expect(totals).toEqual({ away: 13, home: 7 });
    expect(
      eventTotalsMatchFinalScore(totals, { away_score: 13, home_score: 7 }),
    ).toBe(true);
    expect(
      eventTotalsMatchFinalScore(totals, { away_score: 10, home_score: 7 }),
    ).toBe(false);
  });

  it("skips backfill inserts when parsed event totals mismatch the final score", async () => {
    const upsertEvents = vi.fn();
    const logger = { log: vi.fn(), warn: vi.fn() };
    const result = await runBackfillNationsChampionshipMatchEvents(
      { dryRun: false, ownerApproved: true, reparseExisting: false },
      createDb([
        matchRow({
          awayScore: 47,
          awaySlug: "scotland",
          homeScore: 38,
          homeSlug: "argentina",
        }),
      ]),
      {
        fetchEventMatches: async () => [
          parsedMatch({
            awayTeamSlug: "scotland",
            homeTeamSlug: "argentina",
            rawHtml: "wrong-block",
          }),
        ],
        logger,
        parseEvents: () => [
          ...Array.from({ length: 4 }, () =>
            scoringEvent({ teamSide: "home", type: "try" }),
          ),
          ...Array.from({ length: 4 }, () =>
            scoringEvent({ teamSide: "home", type: "conversion" }),
          ),
          ...Array.from({ length: 2 }, () =>
            scoringEvent({ teamSide: "home", type: "penalty_goal" }),
          ),
          ...Array.from({ length: 4 }, () =>
            scoringEvent({ teamSide: "away", type: "try" }),
          ),
          ...Array.from({ length: 3 }, () =>
            scoringEvent({ teamSide: "away", type: "conversion" }),
          ),
          ...Array.from({ length: 2 }, () =>
            scoringEvent({ teamSide: "away", type: "penalty_goal" }),
          ),
        ],
        upsertEvents,
      },
    );

    expect(result.skipped).toBe(1);
    expect(result.eventsInserted).toBe(0);
    expect(upsertEvents).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "event totals mismatch (34-32) vs final score (38-47)",
      ),
    );
  });

  it("upserts matching parsed events and logs totals during dry-run", async () => {
    const upsertEvents = vi.fn().mockResolvedValue({ inserted: 4 });
    const logger = { log: vi.fn(), warn: vi.fn() };
    const matchingEvents = [
      scoringEvent({ teamSide: "home", type: "try" }),
      scoringEvent({ teamSide: "home", type: "conversion" }),
      scoringEvent({ teamSide: "away", type: "penalty_goal" }),
    ];

    const dryRun = await runBackfillNationsChampionshipMatchEvents(
      { dryRun: true, ownerApproved: false, reparseExisting: false },
      createDb([
        matchRow({
          awayScore: 3,
          awaySlug: "italy",
          homeScore: 7,
          homeSlug: "japan",
        }),
      ]),
      {
        fetchEventMatches: async () => [
          parsedMatch({
            awayTeamSlug: "italy",
            homeTeamSlug: "japan",
            rawHtml: "japan-italy",
          }),
        ],
        logger,
        parseEvents: () => matchingEvents,
        upsertEvents,
      },
    );

    expect(dryRun.skipped).toBe(0);
    expect(upsertEvents).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("totals=7-3 final=7-3"),
    );

    const applied = await runBackfillNationsChampionshipMatchEvents(
      { dryRun: false, ownerApproved: true, reparseExisting: false },
      createDb([
        matchRow({
          awayScore: 3,
          awaySlug: "italy",
          homeScore: 7,
          homeSlug: "japan",
        }),
      ]),
      {
        fetchEventMatches: async () => [
          parsedMatch({
            awayTeamSlug: "italy",
            homeTeamSlug: "japan",
            rawHtml: "japan-italy",
          }),
        ],
        logger,
        parseEvents: () => matchingEvents,
        upsertEvents,
      },
    );

    expect(applied.eventsInserted).toBe(4);
    expect(upsertEvents).toHaveBeenCalledTimes(1);
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
