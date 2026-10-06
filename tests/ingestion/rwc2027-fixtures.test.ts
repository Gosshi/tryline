import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetchWithPolicy: vi.fn(),
  saveRawData: vi.fn(),
  upsertMatches: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: () => mocks }));
vi.mock("@/lib/scrapers", () => ({
  fetchWithPolicy: mocks.fetchWithPolicy,
  saveRawData: mocks.saveRawData,
}));
vi.mock("@/lib/ingestion/upsert", () => ({
  upsertMatches: mocks.upsertMatches,
}));

import { ingestRwc2027Fixtures } from "@/lib/ingestion/fixtures";
import {
  RWC_2027_POOL_ASSIGNMENTS,
  RWC_2027_POOL_PAGE_URLS,
} from "@/lib/ingestion/sources/wikipedia-rwc";

describe("RWC 2027 fixture ingestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const teams = Object.keys(RWC_2027_POOL_ASSIGNMENTS).map((slug) => ({
      id: slug,
      slug,
    }));
    mocks.from.mockImplementation((table: string) => ({
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: teams, error: null }),
      select: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: { id: "competition" }, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({
          data:
            table === "competition_standings"
              ? teams.map((team) => ({ team_id: team.id }))
              : [],
          error: null,
        }),
    }));
    mocks.upsertMatches.mockResolvedValue({
      matchesInserted: 0,
      matchesUpdated: 6,
      records: [],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("skips an unknown city before writes, counts it and warns with the match and venue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const html = (
      id: string,
      venue: string,
    ) => `<div class="vevent summary" id="${id}">
      <table><tr><td>9 October 2027<br>18:45 AEDT</td></tr></table>
      <table><tr><td><a>France</a></td><td>v</td><td><a>Japan</a></td></tr></table>
      <span class="location">${venue}</span></div>`;
    mocks.fetchWithPolicy.mockImplementation(async (url: string) => ({
      text: async () =>
        url === RWC_2027_POOL_PAGE_URLS["Pool E"]
          ? html("unknown", "Unknown Stadium, Unknown City") +
            html("France_v_Japan", "Brisbane Stadium, Brisbane")
          : html("known", "Brisbane Stadium, Brisbane"),
    }));

    const result = await ingestRwc2027Fixtures();

    expect(result.counts.skipped_unknown_venue).toBe(1);
    expect(mocks.upsertMatches).toHaveBeenCalledTimes(1);
    const candidates = mocks.upsertMatches.mock.calls[0]![0];
    expect(candidates).toHaveLength(6);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kickoffAt: "2027-10-09T08:45:00.000Z",
          externalIds: expect.objectContaining({
            wikipedia_event_id: "France_v_Japan",
          }),
        }),
      ]),
    );
    expect(candidates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalIds: expect.objectContaining({
            wikipedia_event_id: "unknown",
          }),
        }),
      ]),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown venue"),
      expect.objectContaining({
        teams: "France vs Japan",
        venue: "Unknown Stadium, Unknown City",
      }),
    );
  });
});
