import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260726010000_create_weekly_news_items.sql",
  ),
  "utf8",
);

describe("weekly news items migration", () => {
  it("creates the draft-gated weekly news table with constrained categories", () => {
    expect(migration).toMatch(/create table public\.weekly_news_items/i);
    expect(migration).toMatch(
      /category text not null check \(category in \('transfer', 'quote', 'competition', 'injury', 'other'\)\)/i,
    );
    expect(migration).toMatch(
      /status text not null default 'draft' check \(status in \('draft', 'published'\)\)/i,
    );
  });
});
