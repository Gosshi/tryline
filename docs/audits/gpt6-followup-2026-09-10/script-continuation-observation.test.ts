import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  fetch: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: mocks.db }));
vi.mock("@/lib/ingestion/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingestion/events")>()),
  upsertMatchEvents: mocks.upsert,
}));
vi.mock("@/lib/scrapers", () => ({ fetchWithPolicy: mocks.fetch }));
vi.mock("@/lib/scrapers/wikipedia-match-events", () => ({
  parseMatchEventsFromVeventHtml: () => [
    {
      type: "try",
      teamSide: "home",
      playerName: "Synthetic",
      minute: 1,
      isPenaltyTry: false,
    },
  ],
}));
import { main, runCli } from "@/scripts/fill-event-gaps";

it("exits at the first guard rejection without attempting the remaining match", async () => {
  const rows = ["rejected", "valid"].map((id) => ({
    id,
    home_team_id: "home",
    away_team_id: "away",
    external_ids: {
      wikipedia_event_id: "event",
      wikipedia_url: `https://example.invalid/${id}`,
    },
  }));
  mocks.db.mockReturnValue({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    }),
  });
  mocks.fetch.mockResolvedValue({ text: async () => '<div id="event"></div>' });
  mocks.upsert
    .mockResolvedValueOnce({
      inserted: 0,
      rejected: [{ reason: "score_mismatch", detail: "synthetic" }],
      warnings: [],
    })
    .mockResolvedValue({ inserted: 1, rejected: [], warnings: [] });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const exit = vi.fn((): never => {
    throw new Error("synthetic exit");
  });
  await expect(runCli(() => main(["--limit=2"]), exit)).rejects.toThrow(
    "synthetic exit",
  );
  expect(exit).toHaveBeenCalledWith(1);
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
  expect(mocks.upsert).not.toHaveBeenCalledWith(
    expect.objectContaining({ matchId: "valid" }),
  );
  error.mockRestore();
});
