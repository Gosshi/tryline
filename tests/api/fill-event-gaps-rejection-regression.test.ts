import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), upsert: vi.fn() }));

vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: mocks.db }));
vi.mock("@/lib/cron/auth", () => ({
  assertCronAuthorized: vi.fn(),
  CronUnauthorizedError: class extends Error {},
}));
vi.mock("@/lib/ingestion/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingestion/events")>()),
  upsertMatchEvents: mocks.upsert,
}));
vi.mock("@/lib/scrapers", () => ({
  fetchWithPolicy: vi
    .fn()
    .mockResolvedValue({ text: async () => "<div></div>" }),
}));
vi.mock("@/lib/scrapers/wikipedia-match-events", () => ({
  parseMatchEventsFromVeventHtml: () => [
    { minute: 1, playerName: "Synthetic", teamSide: "home", type: "try" },
  ],
}));

import { POST } from "@/app/api/cron/fill-event-gaps/route";

it("reports a score_mismatch rejection without counting it as filled", async () => {
  const result = {
    data: [
      {
        away_team_id: "away",
        external_ids: { wikipedia_url: "https://example.invalid/mock-only" },
        home_team_id: "home",
        id: "match",
      },
    ],
    error: null,
  };
  const query = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  mocks.db.mockReturnValue({ from: () => query });
  mocks.upsert.mockResolvedValue({
    inserted: 0,
    rejected: [{ detail: "synthetic", reason: "score_mismatch" }],
    warnings: [],
  });

  const response = await POST(
    new Request("http://localhost/api/cron/fill-event-gaps", {
      method: "POST",
    }),
  );

  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toEqual({
    errors: [],
    filled: 0,
    gaps: 1,
    rejections: [
      { detail: "synthetic", matchId: "match", reason: "score_mismatch" },
    ],
  });
});
