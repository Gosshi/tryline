import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetchWithPolicy: vi.fn(),
  saveRawData: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  standings: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: () => mocks }));
vi.mock("@/lib/scrapers", () => ({
  fetchWithPolicy: mocks.fetchWithPolicy,
  saveRawData: mocks.saveRawData,
}));
vi.mock("@/lib/ingestion/standings", () => ({
  upsertCompetitionStandings: mocks.standings,
}));
import { ingestSixNations2027Fixtures } from "@/lib/ingestion/fixtures";
import { parseWikipediaSixNations2027Html } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";

const html = readFileSync(
  "tests/fixtures/wikipedia-six-nations-2027.html",
  "utf8",
);
const parsed = parseWikipediaSixNations2027Html(html);
const teams = [
  ...new Set(parsed.flatMap((m) => [m.homeTeamName, m.awayTeamName])),
].map((name) => ({ id: name.toLowerCase(), name, slug: name.toLowerCase() }));
let existing = true;
beforeEach(() => {
  vi.resetAllMocks();
  existing = true;
  mocks.fetchWithPolicy.mockResolvedValue({ text: async () => html });
  mocks.from.mockImplementation((table: string) => {
    let eventId = "";
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: teams, error: null }),
      contains: vi.fn((_key: string, value: { wikipedia_event_id: string }) => {
        eventId = value.wikipedia_event_id;
        return query;
      }),
      maybeSingle: async () => {
        const match = parsed.find((m) => m.eventId === eventId);
        return {
          error: null,
          data:
            !existing || !match
              ? null
              : {
                  id: match.eventId,
                  competition_id: "competition",
                  home_team_id: match.homeTeamName.toLowerCase(),
                  away_team_id: match.awayTeamName.toLowerCase(),
                  kickoff_at: match.kickoffAt,
                  kickoff_time_tbd: false,
                  venue: match.venue,
                  status: match.status,
                  home_score: match.homeScore,
                  away_score: match.awayScore,
                  external_ids: {
                    wikipedia_event_id: match.eventId,
                    wikipedia_round: match.round,
                  },
                },
        };
      },
      single: async () => ({ data: { id: "competition" }, error: null }),
      insert: mocks.insert,
      update: mocks.update,
      upsert: mocks.upsert,
    };
    if (table !== "matches" && table !== "competitions" && table !== "teams")
      throw new Error(`Unexpected table: ${table}`);
    return query;
  });
});

describe("Six Nations fixture dry-run", () => {
  it.each([true, false])(
    "uses the existing ID matcher and writes nothing (existing=%s)",
    async (present) => {
      existing = present;
      const result = await ingestSixNations2027Fixtures({ dryRun: true });
      expect(result.counts).toEqual({
        matches_inserted: 0,
        matches_updated: 0,
        raw_data_rows: 0,
        standings_upserted: 0,
      });
      expect(result.dry_run?.counts).toEqual({
        parsed: 2,
        insert: present ? 0 : 2,
        update: 0,
        unchanged: present ? 2 : 0,
      });
      expect(result.dry_run?.matches).toEqual(
        parsed.map((match) => ({
          home_slug: match.homeTeamName.toLowerCase(),
          away_slug: match.awayTeamName.toLowerCase(),
          kickoff_at: match.kickoffAt,
          venue: match.venue,
          operation: present ? "unchanged" : "insert",
          ...(present ? { id: match.eventId } : {}),
        })),
      );
      for (const write of [
        mocks.saveRawData,
        mocks.update,
        mocks.insert,
        mocks.upsert,
        mocks.standings,
      ])
        expect(write).not.toHaveBeenCalled();
    },
  );
});
