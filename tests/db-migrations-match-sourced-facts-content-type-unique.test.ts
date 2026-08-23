import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260823010000_match_sourced_facts_content_type_unique.sql";

describe("match sourced facts content-type unique migration", () => {
  it("replaces the old constraint with a content-type-aware unique key", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(
      /drop constraint if exists match_sourced_facts_match_id_fact_key/i,
    );
    expect(migration).toMatch(/unique\s*\(match_id,\s*content_type,\s*fact\)/i);
  });
});
