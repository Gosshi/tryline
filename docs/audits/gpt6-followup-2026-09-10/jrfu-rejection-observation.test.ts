import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  upsert: vi.fn(),
  fetchEvents: vi.fn(),
  live: vi.fn(),
  schedule: vi.fn(),
  resultFallback: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: mocks.db }));
vi.mock("@/lib/ingestion/events", () => ({
  upsertMatchEvents: mocks.upsert,
  resolvePlayerId: vi.fn().mockResolvedValue("synthetic-player"),
}));
vi.mock("@/lib/scrapers/jrfu-match-events", () => ({
  fetchJrfuMatchEvents: mocks.fetchEvents,
}));
vi.mock("@/lib/ingestion/live-ingest", () => ({
  ingestLiveCompetition: mocks.live,
}));
vi.mock("@/lib/ingestion/jrfu-result-fallback", () => ({
  applyJrfuResultFallback: mocks.resultFallback,
  JRFU_OPPONENT_SLUGS: { カナダ代表: "canada" },
}));
vi.mock("@/lib/scrapers/jrfu-schedule-results", () => ({
  fetchJrfuScheduleResults: mocks.schedule,
}));
vi.mock("@/lib/cron/auth", () => ({
  assertCronAuthorized: vi.fn(),
  CronUnauthorizedError: class extends Error {},
}));

import { POST } from "@/app/api/cron/ingest-live-competitions/route";

it("loses an already collected JRFU rejection when the next page fails and returns HTTP 200", async () => {
  const matches = ["01", "08"].map((day, index) => ({
    id: `synthetic-${index}`,
    kickoff_at: `2026-08-${day}T05:00:00Z`,
    home_score: 5,
    away_score: 0,
    home_team: { id: "japan", slug: "japan" },
    away_team: { id: "canada", slug: "canada" },
  }));
  mocks.db.mockReturnValue({
    from: (table: string) => {
      if (table === "teams")
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: async () => ({ data: { id: "japan" }, error: null }),
        };
      if (table === "matches")
        return {
          select: vi.fn().mockReturnThis(),
          or: async () => ({ data: matches, error: null }),
        };
      if (table === "match_events")
        return {
          select: vi.fn().mockReturnThis(),
          eq: async () => ({ count: 0, error: null }),
        };
      throw new Error(`Unexpected table: ${table}`);
    },
  });
  mocks.live.mockResolvedValue({
    competition: "synthetic",
    counts: {},
    unknownTeamNames: [],
  });
  mocks.resultFallback.mockResolvedValue({
    source: "jrfu-schedule",
    counts: {},
  });
  mocks.schedule.mockResolvedValue(
    matches.map((match, index) => ({
      dateJrfu: match.kickoff_at.slice(0, 10),
      japanScore: 5,
      opponentScore: 0,
      opponentName: "カナダ代表",
      matchUrl: `https://example.invalid/${index}`,
    })),
  );
  mocks.fetchEvents
    .mockResolvedValueOnce({
      events: [
        {
          type: "try",
          teamSide: "home",
          playerName: "Synthetic",
          minute: 1,
          isPenaltyTry: false,
        },
      ],
      firstHalfEventCount: 1,
      hasHalfHeadings: true,
      hasUnsupportedScoringEvent: false,
    })
    .mockRejectedValueOnce(
      new Error("synthetic network failure on second match"),
    );
  mocks.upsert.mockResolvedValue({
    inserted: 0,
    warnings: [],
    rejected: [{ reason: "fixture_conflict", detail: "synthetic conflict" }],
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const response = await POST(
    new Request("http://localhost/api/cron/ingest-live-competitions", {
      method: "POST",
    }),
  );
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
  expect(mocks.fetchEvents).toHaveBeenCalledTimes(2);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.rejections).toBeUndefined();
  expect(
    body.results.some(
      (result: { source?: string }) => result.source === "jrfu-match-events",
    ),
  ).toBe(false);
  error.mockRestore();
});
