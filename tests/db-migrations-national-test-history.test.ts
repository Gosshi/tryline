import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("national_test_history migration", () => {
  it("enables RLS and adds SELECT access without write policies", async () => {
    const sql = await readFile(
      "supabase/migrations/20260923100000_create_national_test_history.sql",
      "utf8",
    );
    expect(sql).toMatch(
      /alter table public\.national_test_history enable row level security/i,
    );
    expect(sql).toMatch(/create policy[\s\S]*for select[\s\S]*using \(true\)/i);
    expect(sql).not.toMatch(/for (?:insert|update|delete|all)/i);
    expect(sql).toMatch(/unique \(team_id, opponent_team_id, played_on\)/i);
    expect(sql).toMatch(/check \(team_id <> opponent_team_id\)/i);
  });
});
