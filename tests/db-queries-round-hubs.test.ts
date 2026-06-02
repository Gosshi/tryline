import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

import {
  getRoundMatches,
  listRoundHubParams,
  mapRoundHubRowsToParams,
} from "@/lib/db/queries/matches";

const matchRow = {
  away_score: null,
  away_team: {
    name: "Away",
    short_code: "AWY",
    slug: "away",
  },
  home_score: null,
  home_team: {
    name: "Home",
    short_code: "HOM",
    slug: "home",
  },
  id: "match-1",
  kickoff_at: "2026-01-01T00:00:00.000Z",
  status: "scheduled",
  venue: null,
};

function mockCompetition(data: { id: string } | null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
      })),
    })),
  };
}

function mockMatches(data: unknown[]) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data, error: null })),
      })),
      order: vi.fn(() => Promise.resolve({ data, error: null })),
    })),
  };
}

describe("round hub match queries", () => {
  beforeEach(() => {
    clientMock.from.mockReset();
  });

  it("maps only numeric round rows into round hub params", () => {
    expect(
      mapRoundHubRowsToParams([
        {
          competition: { family: "six-nations", season: "2025" },
          external_ids: { wikipedia_round: 3 },
          kickoff_at: "2025-02-15T12:00:00.000Z",
        },
        {
          competition: { family: "six-nations", season: "2025" },
          external_ids: { round_name: "Final" },
          kickoff_at: "2025-03-15T12:00:00.000Z",
        },
        {
          competition: { family: "premiership", season: "2024-25" },
          external_ids: { round: 18 },
          kickoff_at: "2025-05-10T12:00:00.000Z",
        },
        {
          competition: null,
          external_ids: { round: 1 },
          kickoff_at: "2025-01-01T12:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        competition: "premiership",
        round: 18,
        season: "2024-25",
        updatedAt: "2025-05-10T12:00:00.000Z",
      },
      {
        competition: "six-nations",
        round: 3,
        season: "2025",
        updatedAt: "2025-02-15T12:00:00.000Z",
      },
    ]);
  });

  it("lists distinct numeric round hub params from matches", async () => {
    clientMock.from.mockReturnValue(
      mockMatches([
        {
          competition: { family: "six-nations", season: "2025" },
          external_ids: { wikipedia_round: 1 },
          kickoff_at: "2025-02-01T12:00:00.000Z",
        },
        {
          competition: { family: "six-nations", season: "2025" },
          external_ids: { wikipedia_round: 1 },
          kickoff_at: "2025-02-02T12:00:00.000Z",
        },
        {
          competition: { family: "six-nations", season: "2025" },
          external_ids: { round_name: "Semi-final" },
          kickoff_at: "2025-03-01T12:00:00.000Z",
        },
      ]),
    );

    await expect(listRoundHubParams()).resolves.toEqual([
      {
        competition: "six-nations",
        round: 1,
        season: "2025",
        updatedAt: "2025-02-02T12:00:00.000Z",
      },
    ]);
  });

  it("returns only matches for the requested round", async () => {
    clientMock.from.mockImplementation((table: string) => {
      if (table === "competitions") {
        return mockCompetition({ id: "competition-1" });
      }

      return mockMatches([
        { ...matchRow, external_ids: { round: 1 }, id: "round-1" },
        { ...matchRow, external_ids: { round: 2 }, id: "round-2" },
        { ...matchRow, external_ids: { round_name: "Final" }, id: "final" },
      ]);
    });

    await expect(
      getRoundMatches("six-nations", "2025", 2),
    ).resolves.toMatchObject([{ id: "round-2", round: 2 }]);
  });

  it("returns an empty list when the competition does not exist", async () => {
    clientMock.from.mockReturnValue(mockCompetition(null));

    await expect(getRoundMatches("missing", "2025", 1)).resolves.toEqual([]);
  });
});
