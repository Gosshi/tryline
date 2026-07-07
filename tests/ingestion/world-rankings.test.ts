import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => clientMock,
}));

import {
  buildWorldRankingTeamLookup,
  upsertTeamWorldRankings,
} from "@/lib/ingestion/world-rankings";

describe("world rankings ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.from.mockReturnValue({ update: clientMock.update });
    clientMock.update.mockReturnValue({ eq: clientMock.eq });
    clientMock.eq.mockResolvedValue({ error: null });
  });

  it("builds a lookup using Wikipedia team mappings and team aliases", () => {
    expect(
      buildWorldRankingTeamLookup(
        [
          { points: 90.1, rank: 1, teamName: "New Zealand" },
          { points: 88.2, rank: 2, teamName: "South Africa" },
        ],
        [
          {
            english_name: null,
            id: "team-nz",
            name: "New Zealand",
            slug: "new-zealand",
          },
          {
            english_name: null,
            id: "team-sa",
            name: "South Africa",
            slug: "south-africa",
          },
        ],
      ),
    ).toEqual({
      "New Zealand": "team-nz",
      "South Africa": "team-sa",
    });
  });

  it("updates matched teams and reports unmatched rankings without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      upsertTeamWorldRankings({
        rows: [
          { points: 90.1, rank: 1, teamName: "New Zealand" },
          { points: 70.1, rank: 18, teamName: "Unknown" },
        ],
        teamLookup: { "New Zealand": "team-nz" },
        updatedAt: "2026-07-08T00:00:00.000Z",
      }),
    ).resolves.toEqual({ unmatched: ["Unknown"], updated: 1 });

    expect(clientMock.update).toHaveBeenCalledWith({
      world_ranking: 1,
      world_ranking_updated_at: "2026-07-08T00:00:00.000Z",
    });
    expect(clientMock.eq).toHaveBeenCalledWith("id", "team-nz");
    expect(warn).toHaveBeenCalledWith(
      "Skipping World Rugby ranking for unmatched team: Unknown",
    );

    warn.mockRestore();
  });
});
