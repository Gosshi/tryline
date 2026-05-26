# sitemap をコンテンツあり試合のみに絞る

## 背景

Google Search Console で「クロール済み - インデックス未登録」が多数発生している。
原因は `sitemap.ts` が `listAllMatchIds()` を使っており、AI コンテンツ（プレビュー/レビュー）が
一切ない試合ページも sitemap に含まれているため。

Google がこれらの薄いページを crawl し「価値が低い」と判断してインデックスを拒否している。
コンテンツが存在する試合ページのみを sitemap に載せることで、インデックス品質を改善する。

## スコープ

**対象:**
- `lib/db/queries/matches.ts` — `listMatchIdsWithContent` の戻り値に `competitionFamily` を追加
- `app/sitemap.ts` — `listAllMatchIds` → 更新後の `listMatchIdsWithContent` に差し替え

**対象外:** その他のページ（competition、team、player）の sitemap エントリ

## 実装詳細

### 1. `listMatchIdsWithContent` の戻り値を拡張

`SitemapMatch`（`{ id: string; competitionFamily: string | null }`）を返すよう変更する。
現在は `{ id: string }[]` のみ返しており、EN ページの league-one フィルタに使えない。

**変更前（L755〜L768）:**
```typescript
export async function listMatchIdsWithContent(): Promise<{ id: string }[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select("match_id")
    .eq("status", "published");

  if (error) {
    throw error;
  }

  const unique = [...new Set((data ?? []).map((row) => row.match_id))];

  return unique.map((id) => ({ id }));
}
```

**変更後:**
```typescript
export async function listMatchIdsWithContent(): Promise<SitemapMatch[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        match_id,
        match:matches!match_content_match_id_fkey (
          competition:competitions!matches_competition_id_fkey (
            family,
            slug
          )
        )
      `,
    )
    .eq("status", "published");

  if (error) {
    throw error;
  }

  const seen = new Set<string>();
  const result: SitemapMatch[] = [];

  for (const row of data ?? []) {
    if (seen.has(row.match_id)) continue;
    seen.add(row.match_id);
    const comp = (row.match as { competition: { family: string | null; slug: string } | null } | null)?.competition;
    result.push({
      competitionFamily:
        comp?.family ??
        comp?.slug.replace(/-\d{4}(-\d{2})?$/, "") ??
        null,
      id: row.match_id,
    });
  }

  return result;
}
```

### 2. `sitemap.ts` を差し替え

**変更前:**
```typescript
import { listAllMatchIds } from "@/lib/db/queries/matches";
// ...
const [families, matchIds, playerSlugs, teams] = await Promise.all([
  listFamilies(),
  listAllMatchIds(),
  listAllPlayerSlugs(),
  listAllTeams(),
]);
```

**変更後:**
```typescript
import { listMatchIdsWithContent } from "@/lib/db/queries/matches";
// ...
const [families, matchIds, playerSlugs, teams] = await Promise.all([
  listFamilies(),
  listMatchIdsWithContent(),
  listAllPlayerSlugs(),
  listAllTeams(),
]);
```

`matchPages` と `enMatchPages` の構築ロジックは変更不要。
`matchIds` の型が `SitemapMatch[]` になるため、`.competitionFamily` は引き続き使える。

## 変更ファイルまとめ

| ファイル | 変更内容 |
|----------|---------|
| `lib/db/queries/matches.ts` | `listMatchIdsWithContent` の select クエリを拡張、戻り値を `SitemapMatch[]` に変更 |
| `app/sitemap.ts` | import を `listAllMatchIds` → `listMatchIdsWithContent` に変更 |

## 受け入れ条件

1. TypeScript ビルドが通る
2. `/sitemap.xml` にアクセスして、コンテンツなし試合の URL が含まれていない
3. `/sitemap.xml` に league-one の published 試合の `/en` URL が含まれている
4. `listAllMatchIds` は削除しない（`generateStaticParams` 等で使われている可能性があるため）