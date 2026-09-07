import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

vi.mock("@/lib/ingestion/event-integrity", () => ({
  validateEventInsertion: vi.fn(),
}));

vi.mock("@/lib/llm/notify", () => ({
  notifyEventIngestionIdentityAlert: vi.fn(),
}));

import { resolvePlayerId } from "@/lib/ingestion/events";

type JapaneseNameCandidate = {
  id: string;
  name_ja: string | null;
};

function mockPlayerResolutionQueries(params: {
  englishMatches: Array<{ id: string }>;
  japaneseNameCandidates?: JapaneseNameCandidate[];
}) {
  const ilike = vi.fn().mockResolvedValue({
    data: params.englishMatches,
    error: null,
  });
  const englishTeamFilter = vi.fn(() => ({ ilike }));
  const japaneseTeamFilter = vi.fn().mockResolvedValue({
    data: params.japaneseNameCandidates ?? [],
    error: null,
  });
  const select = vi.fn((columns: string) =>
    columns === "id"
      ? { eq: englishTeamFilter }
      : { eq: japaneseTeamFilter },
  );
  const from = vi.fn(() => ({ select }));

  mocks.getSupabaseServerClient.mockReturnValue({ from } as never);

  return { from, ilike, japaneseTeamFilter, select };
}

describe("resolvePlayerId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps resolving a unique English partial name without loading Japanese candidates", async () => {
    const queries = mockPlayerResolutionQueries({
      englishMatches: [{ id: "marcus-smith" }],
      japaneseNameCandidates: [{ id: "different-player", name_ja: "マーカス" }],
    });

    await expect(
      resolvePlayerId({ playerName: "Marcus", teamId: "team-1" }),
    ).resolves.toBe("marcus-smith");

    expect(queries.from).toHaveBeenCalledTimes(1);
    expect(queries.select).toHaveBeenCalledWith("id");
    expect(queries.ilike).toHaveBeenCalledWith("name", "%Marcus%");
    expect(queries.japaneseTeamFilter).not.toHaveBeenCalled();
  });

  it.each([
    ["岡部　崇人", "岡部崇人"],
    ["岡部 崇人", "岡部　崇人"],
  ])(
    "resolves a Japanese name after removing half-width and full-width spaces",
    async (nameJa, playerName) => {
      const queries = mockPlayerResolutionQueries({
        englishMatches: [],
        japaneseNameCandidates: [{ id: "takato-okabe", name_ja: nameJa }],
      });

      await expect(
        resolvePlayerId({ playerName, teamId: "japan" }),
      ).resolves.toBe("takato-okabe");

      expect(queries.select).toHaveBeenNthCalledWith(1, "id");
      expect(queries.select).toHaveBeenNthCalledWith(2, "id, name_ja");
      expect(queries.japaneseTeamFilter).toHaveBeenCalledWith("team_id", "japan");
    },
  );

  it("returns null when a Japanese name exactly matches multiple players", async () => {
    mockPlayerResolutionQueries({
      englishMatches: [],
      japaneseNameCandidates: [
        { id: "takato-okabe-one", name_ja: "岡部 崇人" },
        { id: "takato-okabe-two", name_ja: "岡部　崇人" },
      ],
    });

    await expect(
      resolvePlayerId({ playerName: "岡部崇人", teamId: "japan" }),
    ).resolves.toBeNull();
  });

  it("returns null when every Japanese-name candidate is null", async () => {
    mockPlayerResolutionQueries({
      englishMatches: [],
      japaneseNameCandidates: [{ id: "untranslated-player", name_ja: null }],
    });

    await expect(
      resolvePlayerId({ playerName: "岡部崇人", teamId: "japan" }),
    ).resolves.toBeNull();
  });

  it("does not use partial Japanese-name matches", async () => {
    mockPlayerResolutionQueries({
      englishMatches: [],
      japaneseNameCandidates: [{ id: "mamoru-harada", name_ja: "原田 衛" }],
    });

    await expect(
      resolvePlayerId({ playerName: "原田", teamId: "japan" }),
    ).resolves.toBeNull();
  });
});
