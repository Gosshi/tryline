import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  broadcastsBuilder: {
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: dbMock.from,
  }),
}));

describe("match broadcast queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.from.mockReturnValue(dbMock.broadcastsBuilder);
    dbMock.broadcastsBuilder.then.mockImplementation((resolve) =>
      Promise.resolve(
        resolve({
          data: [
            {
              display_order: 0,
              kind: "tv",
              match_id: "match-1",
              service_name: "WOWOW プライム",
              source_url: "https://source.example.com",
              url: "https://example.com/wowow",
              verified_at: "2026-07-15T12:00:00.000Z",
            },
            {
              display_order: 1,
              kind: "streaming",
              match_id: "match-1",
              service_name: "J SPORTS オンデマンド",
              source_url: null,
              url: "https://example.com/jsports",
              verified_at: "2026-07-15T13:00:00.000Z",
            },
          ],
          error: null,
        }),
      ),
    );
  });

  it("loads broadcasts grouped by match in display order", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");

    const broadcasts = await getMatchBroadcastsForMatches(["match-1"]);

    expect(dbMock.from).toHaveBeenCalledWith("match_broadcasts");
    expect(dbMock.broadcastsBuilder.in).toHaveBeenCalledWith("match_id", [
      "match-1",
    ]);
    expect(dbMock.broadcastsBuilder.order).toHaveBeenNthCalledWith(
      1,
      "display_order",
      { ascending: true },
    );
    expect(broadcasts.get("match-1")).toEqual([
      {
        displayOrder: 0,
        kind: "tv",
        serviceName: "WOWOW プライム",
        sourceUrl: "https://source.example.com",
        url: "https://example.com/wowow",
        verifiedAt: "2026-07-15T12:00:00.000Z",
      },
      {
        displayOrder: 1,
        kind: "streaming",
        serviceName: "J SPORTS オンデマンド",
        sourceUrl: null,
        url: "https://example.com/jsports",
        verifiedAt: "2026-07-15T13:00:00.000Z",
      },
    ]);
  });

  it("returns an empty map without querying for an empty input", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");

    await expect(getMatchBroadcastsForMatches([])).resolves.toEqual(new Map());
    expect(dbMock.from).not.toHaveBeenCalled();
  });
});
