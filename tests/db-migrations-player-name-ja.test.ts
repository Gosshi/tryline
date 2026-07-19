import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260719010000_add_players_name_ja.sql",
  ),
  "utf8",
);

describe("players name_ja migration", () => {
  it("adds the nullable Japanese player-name column", () => {
    expect(migration).toMatch(
      /alter table public\.players add column if not exists name_ja text/i,
    );
  });
});
