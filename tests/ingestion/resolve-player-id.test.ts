import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));

import { resolvePlayerId } from "@/lib/ingestion/events";

describe("resolvePlayerId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not query players for an empty or whitespace-only name", async () => {
    await expect(resolvePlayerId({ playerName: "", teamId: "team-1" })).resolves.toBeNull();
    await expect(resolvePlayerId({ playerName: "  ", teamId: "team-1" })).resolves.toBeNull();

    expect(dbMock.from).not.toHaveBeenCalled();
  });

  it("keeps resolving a unique non-empty partial player name", async () => {
    const query = {
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ data: [{ id: "player-1" }], error: null }),
      select: vi.fn().mockReturnThis(),
    };
    dbMock.from.mockReturnValue(query);

    await expect(
      resolvePlayerId({ playerName: "Marcus", teamId: "team-1" }),
    ).resolves.toBe("player-1");
    expect(query.ilike).toHaveBeenCalledWith("name", "%Marcus%");
  });
});
