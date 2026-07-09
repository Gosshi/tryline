import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  competitionUpsert: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  teamRows: [
    { id: "team-ireland", name: "Ireland", slug: "ireland" },
    { id: "team-england", name: "England", slug: "england" },
  ],
}));

const ingestionMocks = vi.hoisted(() => ({
  saveRawData: vi.fn(),
  upsertMatchEvents: vi.fn(),
  upsertMatches: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: dbMocks.getSupabaseServerClient,
}));
vi.mock("@/lib/ingestion/events", () => ({
  upsertMatchEvents: ingestionMocks.upsertMatchEvents,
}));
vi.mock("@/lib/ingestion/upsert", () => ({
  upsertMatches: ingestionMocks.upsertMatches,
}));
vi.mock("@/lib/scrapers", () => ({
  saveRawData: ingestionMocks.saveRawData,
}));

function createCompetitionQuery() {
  const query = {
    select: vi.fn(() => query),
    single: vi.fn(() =>
      Promise.resolve({ data: { id: "competition-1" }, error: null }),
    ),
    upsert: dbMocks.competitionUpsert,
  };
  dbMocks.competitionUpsert.mockReturnValue(query);

  return query;
}

function createTeamsQuery() {
  const query = {
    in: vi.fn(() => Promise.resolve({ data: dbMocks.teamRows, error: null })),
    select: vi.fn(() => query),
  };

  return query;
}

describe("Six Nations 2027 live ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    dbMocks.getSupabaseServerClient.mockImplementation(() => ({
      from: vi.fn((table: string) => {
        if (table === "competitions") {
          return createCompetitionQuery();
        }

        if (table === "teams") {
          return createTeamsQuery();
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    }));
    ingestionMocks.saveRawData.mockResolvedValue(undefined);
    ingestionMocks.upsertMatchEvents.mockResolvedValue({ inserted: 1 });
    ingestionMocks.upsertMatches.mockResolvedValue({
      matchesInserted: 0,
      matchesUpdated: 1,
      records: [
        {
          awayTeamId: "team-england",
          candidateIndex: 0,
          externalIds: {
            source: "wikipedia",
            wikipedia_event_id: "Ireland_v_England",
            wikipedia_round: 1,
            wikipedia_url:
              "https://en.wikipedia.org/wiki/2027_Six_Nations_Championship",
          },
          homeTeamId: "team-ireland",
          id: "match-1",
          previousStatus: "scheduled",
          status: "finished",
          statusChangedToFinished: true,
        },
      ],
    });
  });

  it("resolves teams by name and extracts events for a newly finished match", async () => {
    const rawHtml = `
      <div class="vevent summary" id="Ireland_v_England">
        <table>
          <tr>
            <td class="vcard"><span class="fn org">Ireland</span></td>
            <td>10–7</td>
            <td class="vcard"><span class="fn org">England</span></td>
          </tr>
          <tr style="font-size:85%">
            <td><b>Try:</b> <a>Irish Scorer</a> 12'</td>
            <td></td>
            <td><b>Try:</b> <a>English Scorer</a> 20'</td>
          </tr>
        </table>
      </div>
    `;
    const { ingestLiveCompetition } =
      await import("@/lib/ingestion/live-ingest");

    const result = await ingestLiveCompetition({
      competitionName: "Six Nations 2027",
      competitionSlug: "six-nations-2027",
      family: "six-nations",
      fetch: vi.fn().mockResolvedValue([
        {
          awayScore: 7,
          awayTeamName: "England",
          eventId: "Ireland_v_England",
          homeScore: 10,
          homeTeamName: "Ireland",
          kickoffAt: "2027-02-05T20:10:00.000Z",
          lineupTableHtml: null,
          rawHtml,
          round: 1,
          roundName: null,
          status: "finished",
          venue: "Aviva Stadium",
          wikipediaUrl:
            "https://en.wikipedia.org/wiki/2027_Six_Nations_Championship",
        },
      ]),
      season: "2027",
      sourceLabel: "wikipedia",
    });

    expect(dbMocks.competitionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        family: "six-nations",
        slug: "six-nations-2027",
      }),
      { onConflict: "slug" },
    );
    expect(ingestionMocks.upsertMatches).toHaveBeenCalledWith([
      expect.objectContaining({
        awayTeamId: "team-england",
        competitionId: "competition-1",
        externalIds: expect.objectContaining({
          wikipedia_event_id: "Ireland_v_England",
          wikipedia_round: 1,
          wikipedia_url:
            "https://en.wikipedia.org/wiki/2027_Six_Nations_Championship",
        }),
        homeTeamId: "team-ireland",
        rawHtml,
      }),
    ]);
    expect(ingestionMocks.upsertMatchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        awayTeamId: "team-england",
        events: expect.arrayContaining([
          expect.objectContaining({
            playerName: "Irish Scorer",
            teamSide: "home",
            type: "try",
          }),
          expect.objectContaining({
            playerName: "English Scorer",
            teamSide: "away",
            type: "try",
          }),
        ]),
        homeTeamId: "team-ireland",
        matchId: "match-1",
      }),
    );
    expect(result).toEqual({
      competition: "six-nations-2027",
      counts: {
        events_inserted: 1,
        matches_inserted: 0,
        matches_updated: 1,
      },
    });
  });
});
