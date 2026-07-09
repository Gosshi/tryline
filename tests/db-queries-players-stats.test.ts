import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

vi.mock("@/lib/db/queries/matches", () => ({
  listMatchIdsWithContent: vi.fn(),
}));

import { getPlayerCareerStats } from "@/lib/db/queries/players";

function mockRangeRows<T>(rows: T[]) {
  return vi.fn((from: number) =>
    Promise.resolve({
      data: from === 0 ? rows : [],
      error: null,
    }),
  );
}

describe("getPlayerCareerStats", () => {
  beforeEach(() => {
    clientMock.from.mockReset();
  });

  it("aggregates canonical player appearances and metadata player_name scoring events", async () => {
    const lineupRange = mockRangeRows([
      { match_id: "match-1" },
      { match_id: "match-2" },
      { match_id: "match-1" },
    ]);
    const eventRange = mockRangeRows([
      {
        metadata: { player_name: "Takuro Matsunaga" },
        type: "try",
      },
      {
        metadata: { player_name: "Matsunaga" },
        type: "conversion",
      },
      {
        metadata: { player_name: "Takuro Matsunaga" },
        type: "penalty_goal",
      },
      {
        metadata: { player_name: "Other Player" },
        type: "try",
      },
    ]);

    clientMock.from.mockImplementation((table: string) => {
      if (table === "players") {
        return {
          select: vi.fn((columns: string) => {
            if (columns === "id") {
              return {
                or: vi.fn(() =>
                  Promise.resolve({
                    data: [{ id: "player-1" }, { id: "alias-1" }],
                    error: null,
                  }),
                ),
              };
            }

            return {
              in: vi.fn(() =>
                Promise.resolve({
                  data: [
                    { id: "player-1", name: "Takuro Matsunaga" },
                    { id: "alias-1", name: "松永 拓朗" },
                  ],
                  error: null,
                }),
              ),
            };
          }),
        };
      }

      if (table === "match_lineups") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              range: lineupRange,
            })),
          })),
        };
      }

      if (table === "match_events") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              in: vi.fn(() => ({
                range: eventRange,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(getPlayerCareerStats("player-1")).resolves.toEqual({
      appearances: 2,
      conversions: 1,
      penaltyGoals: 1,
      points: 10,
      tries: 1,
    });
  });
});
