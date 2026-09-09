import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: mocks.db }));
vi.mock("@/lib/cron/auth", () => ({ assertCronAuthorized: vi.fn(), CronUnauthorizedError: class extends Error {} }));
vi.mock("@/lib/ingestion/events", () => ({ upsertMatchEvents: mocks.upsert }));
vi.mock("@/lib/scrapers", () => ({ fetchWithPolicy: vi.fn().mockResolvedValue({ text: async () => "<div></div>" }) }));
vi.mock("@/lib/scrapers/wikipedia-match-events", () => ({ parseMatchEventsFromVeventHtml: () => [{ type: "try", teamSide: "home", minute: 1, playerName: "Synthetic" }] }));

import { POST } from "@/app/api/cron/fill-event-gaps/route";

it("reports a score_mismatch rejection without counting it as filled", async () => {
  const result = { data: [{ id: "match", home_team_id: "home", away_team_id: "away", external_ids: { wikipedia_url: "https://example.invalid/mock-only" } }], error: null };
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  mocks.db.mockReturnValue({ from: () => query });
  mocks.upsert.mockResolvedValue({ inserted: 0, rejected: [{ reason: "score_mismatch", detail: "synthetic" }], warnings: [] });
  const response = await POST(new Request("http://localhost/api/cron/fill-event-gaps", { method: "POST" }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    errors: [],
    filled: 0,
    gaps: 1,
    rejections: [
      { detail: "synthetic", matchId: "match", reason: "score_mismatch" },
    ],
  });
});
