import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260719020000_add_match_sourced_facts_fact_ja.sql",
  ),
  "utf8",
);

describe("match sourced facts fact_ja migration", () => {
  it("adds the nullable Japanese fact column", () => {
    expect(migration).toMatch(
      /alter table public\.match_sourced_facts\s+add column if not exists fact_ja text/i,
    );
  });
});
