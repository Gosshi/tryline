import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260726020000_enable_weekly_news_items_rls.sql",
  ),
  "utf8",
);

describe("weekly news items RLS migration", () => {
  it("enables RLS and exposes only published items to public roles", () => {
    expect(migration).toMatch(
      /alter table public\.weekly_news_items enable row level security/i,
    );
    expect(migration).toMatch(
      /create policy "published weekly news items are publicly readable"[\s\S]*on public\.weekly_news_items[\s\S]*for select[\s\S]*to anon, authenticated[\s\S]*using \(status = 'published'\)/i,
    );
    expect(migration).not.toMatch(/using \(true\)/i);
  });
});
