import { expect, it, vi } from "vitest";

import { auditCompetitionGuideFacts } from "@/tools/audit-competition-guide-facts";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Observation of current incorrect behavior, not a passing regression test.
it("reports complete and discards a schedule team when two partial tables agree", async () => {
  const rows: Record<string, unknown> = {
    competition_guides: {
      family: "synthetic",
      guide_ja: "参加チームはTeam AとTeam B。",
      source_url: null,
      updated_at: "2026-09-10T00:00:00Z",
      verified_at: null,
    },
    competitions: [{ id: "competition", slug: "synthetic-2026" }],
    competition_standings: [{ competition_id: "competition", team_id: "a" }],
    competition_teams: [{ competition_id: "competition", team_id: "a" }],
    matches: [
      { competition_id: "competition", home_team_id: "a", away_team_id: "b" },
    ],
    teams: ["a", "b"].map((id) => ({
      id,
      slug: `team-${id}`,
      name: `Team ${id.toUpperCase()}`,
      english_name: `Team ${id.toUpperCase()}`,
      name_ja: null,
    })),
  };
  const db = {
    from: vi.fn((table: string) => {
      const result = { data: rows[table], error: null };
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: async () => result,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
    }),
  } as unknown as SupabaseClient<Database>;
  const report = await auditCompetitionGuideFacts(
    db,
    {
      family: "synthetic",
      season: "2026",
      outputDir: "unused",
    },
    "2026-09-10T00:00:00Z",
  );
  expect(report.coverage).toBe("complete");
  expect(report.actualDataTeams).toEqual([{ name: "Team A", slug: "team-a" }]);
  expect(report.guideOnlyCandidates).toEqual([
    expect.objectContaining({ teamSlug: "team-b" }),
  ]);
});
