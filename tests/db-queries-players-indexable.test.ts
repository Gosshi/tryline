import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

const matchesMock = vi.hoisted(() => ({
  listMatchIdsWithContent: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);

import {
  isIndexablePlayer,
  listIndexablePlayerSlugs,
} from "@/lib/db/queries/players";

const lineupPlayers = [
  {
    canonical_player_id: null,
    id: "anonymous-player",
    name: "山田 太郎",
    slug: "player-1234abcd",
  },
  {
    canonical_player_id: null,
    id: "real-player",
    name: "Finn Russell",
    slug: "finn-russell",
  },
  {
    canonical_player_id: "canonical-player",
    id: "alias-player",
    name: "Alias Name",
    slug: "alias-name",
  },
];

const canonicalPlayers = [
  lineupPlayers[0]!,
  lineupPlayers[1]!,
  {
    canonical_player_id: null,
    id: "canonical-player",
    name: "Maro Itoje",
    slug: "maro-itoje",
  },
  {
    canonical_player_id: null,
    id: "zero-lineup-player",
    name: "Zero Lineup",
    slug: "zero-lineup",
  },
];

describe("indexable player queries", () => {
  beforeEach(() => {
    clientMock.from.mockReset();
    matchesMock.listMatchIdsWithContent.mockReset();
  });

  it("keeps only real canonical players with a published-content lineup", async () => {
    matchesMock.listMatchIdsWithContent.mockResolvedValue([
      { competitionFamily: "premiership", id: "match-with-content" },
    ]);

    clientMock.from.mockImplementation((table: string) => {
      if (table === "match_lineups") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() =>
              Promise.resolve({
                data: lineupPlayers.map((player) => ({ player })),
                error: null,
              }),
            ),
          })),
        };
      }

      if (table === "players") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((_column: string, ids: string[]) => ({
              is: vi.fn(() =>
                Promise.resolve({
                  data: canonicalPlayers.filter((player) =>
                    ids.includes(player.id),
                  ),
                  error: null,
                }),
              ),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(listIndexablePlayerSlugs()).resolves.toEqual([
      "finn-russell",
      "maro-itoje",
    ]);
  });

  it("returns an empty list when no matches have published content", async () => {
    matchesMock.listMatchIdsWithContent.mockResolvedValue([]);

    await expect(listIndexablePlayerSlugs()).resolves.toEqual([]);
    expect(clientMock.from).not.toHaveBeenCalled();
  });

  it("identifies indexable player details in one helper", () => {
    expect(
      isIndexablePlayer({
        canonicalSlug: null,
        hasPublishedContentMatch: true,
        slug: "finn-russell",
      }),
    ).toBe(true);
    expect(
      isIndexablePlayer({
        canonicalSlug: null,
        hasPublishedContentMatch: true,
        slug: "player-1234abcd",
      }),
    ).toBe(false);
    expect(
      isIndexablePlayer({
        canonicalSlug: null,
        hasPublishedContentMatch: false,
        slug: "finn-russell",
      }),
    ).toBe(false);
    expect(
      isIndexablePlayer({
        canonicalSlug: "finn-russell",
        hasPublishedContentMatch: true,
        slug: "finn-russell-alias",
      }),
    ).toBe(false);
  });
});
