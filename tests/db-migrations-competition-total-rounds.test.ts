import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260902000000_add_competition_total_rounds.sql",
  ),
  "utf8",
);

describe("competition total_rounds migration", () => {
  it("adds a nullable column and updates only the three configured seasons", () => {
    expect(migration).toMatch(
      /alter table public\.competitions add column total_rounds integer/i,
    );
    expect(migration).toMatch(
      /total_rounds = 26[\s\S]*?family = 'top-14' and season = '2026-27'/i,
    );
    expect(migration).toMatch(
      /total_rounds = 18[\s\S]*?family = 'urc' and season = '2026-27'/i,
    );
    expect(migration).toMatch(
      /total_rounds = 18[\s\S]*?family = 'premiership' and season = '2026-27'/i,
    );
    expect(migration.match(/update public\.competitions/gi)).toHaveLength(3);
  });
});
