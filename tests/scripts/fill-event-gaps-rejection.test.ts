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
vi.mock("@/lib/scrapers", () => ({ fetchWithPolicy: mocks.fetchWithPolicy }));
vi.mock("@/lib/scrapers/wikipedia-match-events", () => ({
  parseMatchEventsFromVeventHtml: mocks.parseMatchEvents,
}));

it("continues after a rejected insertion before reaching exit 1", async () => {
  const matchesQuery = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [
          {
            away_team_id: "away",
            external_ids: {
              wikipedia_event_id: "event",
              wikipedia_url: "https://example.invalid/event",
            },
            home_team_id: "home",
            id: "match-rejected",
          },
          {
            away_team_id: "away",
            external_ids: {
              wikipedia_event_id: "event",
              wikipedia_url: "https://example.invalid/event",
            },
            home_team_id: "home",
            id: "match-normal",
          },
        ],
        error: null,
      }).then(resolve),
  };
  mocks.getSupabaseServerClient.mockReturnValue({
    from: vi.fn(() => matchesQuery),
  });
  mocks.fetchWithPolicy.mockResolvedValue({
    text: async () => '<div id="event"></div>',
  });
  mocks.parseMatchEvents.mockReturnValue([
    {
      isPenaltyTry: false,
      minute: 1,
      playerName: "Synthetic",
      teamSide: "home",
      type: "try",
    },
  ]);
  mocks.upsertMatchEvents
    .mockResolvedValueOnce({
      inserted: 0,
      rejected: [{ detail: "synthetic", reason: "score_mismatch" }],
      warnings: [],
    })
    .mockResolvedValueOnce({ inserted: 1, rejected: [], warnings: [] });
  const { main, runCli } = await import("@/scripts/fill-event-gaps");
  const exit = vi.fn(() => {
    throw new Error("exit");
  }) as unknown as (code: number) => never;
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await expect(runCli(() => main(["--limit=1"]), exit)).rejects.toThrow("exit");

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
