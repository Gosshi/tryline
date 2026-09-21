import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));

function query(result: unknown) {
  const value = Promise.resolve(result);
  return {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: value.then.bind(value),
  };
}

describe("calculateStandings missing events gate", () => {
  it("does not upsert any rows when a finished match has no match_events", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "competitions") {
        return query({
          data: { family: "top-14", id: "competition", slug: "top-14-2025-26" },
          error: null,
        });
      }
      if (table === "competition_teams") {
        return query({ data: [], error: null });
      }
      if (table === "matches") {
        return query({
          data: [
            {
              away_score: 20,
              away_team_id: "away",
              home_score: 25,
              home_team_id: "home",
              id: "match-without-events",
            },
          ],
          error: null,
        });
      }
      if (table === "match_events") {
        return query({ data: [], error: null });
      }
      if (table === "competition_standings") {
        return { upsert: mocks.upsert };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { calculateStandings } = await import("@/scripts/calculate-standings");

    await expect(calculateStandings("top-14-2025-26")).rejects.toThrow(
      "finished_match_events_missing: match-without-events",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
