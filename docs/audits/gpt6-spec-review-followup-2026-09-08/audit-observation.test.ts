import { expect, it, vi } from "vitest";

import { auditCompetitionGuideFacts } from "@/tools/audit-competition-guide-facts";
import { auditPublishedRecapEventIntegrity } from "@/tools/audit-published-recap-event-integrity";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: () => { throw new Error("No real DB access"); } }));

function dbFor(tables: Record<string, unknown>) {
  return { from: (table: string) => {
    if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
    const response = { data: tables[table], error: null };
    return {
      select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue(response), maybeSingle: vi.fn().mockResolvedValue(response),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve),
    };
  } } as unknown as SupabaseClient<Database>;
}

it("anonymous unrelated logs are elevated to confirmed contamination", async () => {
  const db = dbFor({
    match_content: [{ match_id: "target", content_type: "recap", status: "published", language: "ja", prompt_version: "synthetic", generated_at: "2026-09-08T00:00:00Z" }],
    matches: ["target", "other"].map(id => ({ id, home_team_id: "home", away_team_id: "away", home_score: 25, away_score: 0, status: "finished", external_ids: {}, kickoff_at: "2026-09-08T00:00:00Z", home_team: { name: "Home" }, away_team: { name: "Away" }, competition: { slug: "synthetic" } })),
    match_events: ["target", "other"].flatMap(id => Array.from({ length: 4 }, (_, index) => ({ match_id: id, minute: index + 1, type: "try", metadata: {}, team_id: id === "target" ? "home" : "away" }))),
  });
  const report = await auditPublishedRecapEventIntegrity(db, { outputDir: "unused" }, "2026-09-08T00:00:00Z", { log: vi.fn() });
  expect(report.findings[0]).toMatchObject({ severity: "confirmed", checksHit: ["C1", "C3", "C4"] });
});

it("one standings row across two competitions is reported as complete coverage", async () => {
  const report = await auditCompetitionGuideFacts(dbFor({
    competition_guides: { family: "synthetic", guide_ja: "参加チームはTeam AとTeam B。", source_url: null, verified_at: null, updated_at: "2026-09-08T00:00:00Z" },
    competitions: [{ id: "pool-a", slug: "pool-a" }, { id: "pool-b", slug: "pool-b" }],
    competition_standings: [{ competition_id: "pool-a", team_id: "a" }],
    teams: ["a", "b"].map(id => ({ id, name: `Team ${id.toUpperCase()}`, english_name: `Team ${id.toUpperCase()}`, name_ja: null, slug: `team-${id}` })),
  }), { family: "synthetic", season: "2026", outputDir: "unused" }, "2026-09-08T00:00:00Z");
  expect(report.coverage).toBe("complete");
  expect(report.actualDataTeams).toHaveLength(1);
  expect(report.guideOnlyCandidates).toHaveLength(1);
});
