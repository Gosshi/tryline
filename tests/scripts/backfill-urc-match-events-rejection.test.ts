import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  parseMatchEvents: vi.fn(),
  upsertMatchEvents: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));
vi.mock("@/lib/ingestion/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingestion/events")>()),
  upsertMatchEvents: mocks.upsertMatchEvents,
}));
vi.mock("@/lib/scrapers/fetcher", () => ({
  fetchWithPolicy: mocks.fetchWithPolicy,
}));
vi.mock("@/lib/scrapers/wikipedia-urc-match-details", () => ({
  parseWikipediaUrcMatchDetailsHtml: mocks.parseMatchEvents,
}));

it("continues after a rejected URC insertion before reaching exit 1", async () => {
  const competitionsQuery = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [{ id: "urc", season: "2025-26", slug: "urc-2025-26" }],
        error: null,
      }).then(resolve),
  };
  const matchesQuery = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [
          {
            away_team: { name: "Away" },
            away_team_id: "away",
            competition_id: "urc",
            external_ids: {
              wikipedia_event_id: "event",
              wikipedia_url:
                "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
            },
            home_team: { name: "Home" },
            home_team_id: "home",
            id: "match-rejected",
            match_events: [],
          },
          {
            away_team: { name: "Away Two" },
            away_team_id: "away-two",
            competition_id: "urc",
            external_ids: {
              wikipedia_event_id: "event-normal",
              wikipedia_url:
                "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
            },
            home_team: { name: "Home Two" },
            home_team_id: "home-two",
            id: "match-normal",
            match_events: [],
          },
        ],
        error: null,
      }).then(resolve),
  };
  mocks.getSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) =>
      table === "competitions" ? competitionsQuery : matchesQuery,
    ),
  });
  mocks.fetchWithPolicy.mockResolvedValue({ text: async () => "<html />" });
  mocks.parseMatchEvents.mockReturnValue({
    events: [
      {
        isPenaltyTry: false,
        minute: 1,
        playerName: "Synthetic",
        teamSide: "home",
        type: "try",
      },
    ],
  });
  mocks.upsertMatchEvents
    .mockResolvedValueOnce({
      inserted: 0,
      rejected: [{ detail: "synthetic", reason: "score_mismatch" }],
      warnings: [],
    })
    .mockResolvedValueOnce({ inserted: 1, rejected: [], warnings: [] });
  const { main, runCli } = await import("@/scripts/backfill-urc-match-events");
  const exit = vi.fn(() => {
    throw new Error("exit");
  }) as unknown as (code: number) => never;
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await expect(
    runCli(() => main(["--confirm-owner-approved"]), exit),
  ).rejects.toThrow("exit");

  expect(mocks.upsertMatchEvents).toHaveBeenCalledWith(
    expect.objectContaining({ matchId: "match-rejected" }),
  );
  expect(mocks.upsertMatchEvents).toHaveBeenCalledWith(
    expect.objectContaining({ matchId: "match-normal" }),
  );
  expect(mocks.upsertMatchEvents).toHaveBeenCalledTimes(2);
  expect(exit).toHaveBeenCalledWith(1);
  error.mockRestore();
});
