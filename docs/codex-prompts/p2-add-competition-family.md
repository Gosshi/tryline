# Codex Prompt: competitions.family カラム追加

## 背景

`/c/[competition]/[season]` 形式のルーティングを導入するにあたり、「大会ファミリー」（例: `six-nations`）と「シーズン」（例: `2025`）を別々に扱う必要がある。現在の `competitions.slug` は `six-nations-2025` のように両者を結合しており、ファミリー単位のクエリに文字列プレフィックスマッチが必要になるため脆い。`family` カラムを追加して解決する。

---

## Task 1 — マイグレーション作成

`supabase/migrations/20260501000000_add_competition_family.sql` を新規作成する。

```sql
alter table public.competitions
  add column if not exists family text;

-- 既存行を slug から family を逆算して埋める
-- slug パターン: "{family}-{season}" （例: six-nations-2025 → six-nations）
update public.competitions
set family = regexp_replace(slug, '-\d{4}$', '')
where family is null;

-- 全行が埋まったことを確認してから NOT NULL 制約を追加
alter table public.competitions
  alter column family set not null;

-- family 単位で一覧取得するインデックス
create index if not exists idx_competitions_family
  on public.competitions (family);
```

マイグレーション適用:

```bash
supabase db push
```

---

## Task 2 — `lib/db/queries/competitions.ts` を新規作成

競技ファミリー関連のクエリを集約する。`createPublicServerClient` は既存の `lib/db/public-server.ts` からインポートする。

```typescript
import { createPublicServerClient } from "@/lib/db/public-server";

export type CompetitionRow = {
  id: string;
  slug: string;
  family: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
};

/** ファミリー内の全シーズンを season DESC で返す */
export async function listSeasonsByFamily(
  family: string,
): Promise<CompetitionRow[]> {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("competitions")
    .select("id, slug, family, name, season, start_date, end_date")
    .eq("family", family)
    .order("season", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    family: row.family,
    name: row.name,
    season: row.season,
    startDate: row.start_date,
    endDate: row.end_date,
  }));
}

/** slug で 1 件取得。存在しない場合は null を返す */
export async function getCompetitionBySlug(
  slug: string,
): Promise<CompetitionRow | null> {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("competitions")
    .select("id, slug, family, name, season, start_date, end_date")
    .eq("slug", slug)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return {
    id: data.id,
    slug: data.slug,
    family: data.family,
    name: data.name,
    season: data.season,
    startDate: data.start_date,
    endDate: data.end_date,
  };
}

/** DB に存在するファミリー一覧（重複排除、アルファベット順） */
export async function listFamilies(): Promise<string[]> {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("competitions")
    .select("family");

  if (error) throw error;

  return [...new Set((data ?? []).map((row) => row.family as string))].sort();
}
```

---

## 完了条件

- [ ] `supabase/migrations/20260501000000_add_competition_family.sql` が存在する
- [ ] `supabase db push` が成功する
- [ ] 本番 DB の全 `competitions` 行に `family` が設定されている（例: `six-nations-2025` → `six-nations`）
- [ ] `lib/db/queries/competitions.ts` が作成されている
- [ ] `pnpm tsc --noEmit` がパスする

## 変更しないこと

- 既存の `lib/db/queries/matches.ts`
- `competitions.slug` の値（内部 ID として保持する）
- 他のマイグレーションファイル
