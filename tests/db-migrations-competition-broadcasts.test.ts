import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20261116120000_create_competition_broadcasts.sql",
  ),
  "utf8",
);

describe("competition broadcast migration", () => {
  it("requires sourced full-competition service rows with a unique service and cascading competition reference", () => {
    expect(migration).toContain(
      "create table if not exists public.competition_broadcasts",
    );
    expect(migration).toContain(
      "competition_id uuid not null references public.competitions(id) on delete cascade",
    );
    expect(migration).toContain("unique (competition_id, service_name)");
    expect(migration).toContain("source_url text not null");
    expect(migration).toContain("check (kind in ('tv', 'streaming'))");
    expect(migration).toMatch(
      /comment on table public\.competition_broadcasts[\s\S]*every match/,
    );
  });
  it("indexes competition_id and grants only public select behind RLS", () => {
    expect(migration).toContain(
      "create index if not exists competition_broadcasts_competition_id_idx",
    );
    expect(migration).toContain(
      "on public.competition_broadcasts (competition_id)",
    );
    expect(migration).toContain(
      "alter table public.competition_broadcasts enable row level security",
    );
    expect(migration).toMatch(
      /create policy "public read"[\s\S]*?for select\s+to anon, authenticated\s+using \(true\)/,
    );
    expect(migration).toContain(
      "revoke all on public.competition_broadcasts from anon, authenticated;",
    );
    expect(migration.match(/grant\s+[^;]+;/g)).toEqual([
      "grant select on public.competition_broadcasts to anon, authenticated;",
    ]);
  });
  it("seeds exactly the three announced services only for League One 2026-27 by slug", () => {
    expect(migration).toContain("insert into public.competition_broadcasts");
    expect(migration).toContain(
      "select c.id, v.service_name, v.url, v.kind, v.display_order, '2026-11-16T12:00:00Z', v.source_url",
    );
    expect(migration).toContain("where c.slug = 'league-one-2026-27'");
    expect(migration).toContain(
      "('J SPORTS（BS）', 'https://www.jsports.co.jp/rugby/league-one/', 'tv', 0,",
    );
    expect(migration).toContain(
      "('J SPORTSオンデマンド', 'https://www.jsports.co.jp/rugby/league-one/', 'streaming', 10,",
    );
    expect(migration).toContain(
      "('DAZN', 'https://www.dazn.com/ja-JP/', 'streaming', 20,",
    );
    expect(migration.match(/^\s*\('/gm)).toHaveLength(3);
    expect(migration).toContain(
      "https://prtimes.jp/main/html/rd/p/000000636.000014079.html",
    );
    expect(migration).toContain("https://dazngroup.com/press-room/1015/");
    expect(migration).toContain(
      "on conflict (competition_id, service_name) do nothing;",
    );
  });
});
