# 大会ページ: Top 14・Rugby Championship・PNC の「最近のレビュー」未表示修正

## 背景

`app/c/[competition]/page.tsx` は `getRecentlyReviewedMatchesForFamily(competition, 3)` を
呼び出して大会ページ下部に「最近のレビュー」セクションを表示する。

しかし `lib/db/queries/matches.ts:486` の実装に問題がある:

```typescript
// 現状
await client
  .from("match_content")
  .select(`match:matches!...(competition:competitions!...(family, ...))`)
  .eq("content_type", "recap")
  .eq("language", "ja")
  .eq("status", "published")
  .order("generated_at", { ascending: false })
  .limit(50);  // 全大会の最新 50 件を取得

// family フィルタはクライアントサイド
data.filter((row) => row.match?.competition?.family === family)
```

`limit(50)` は全大会を跨いだ最新 50 件を取得する。
Six Nations や Premiership のコンテンツ量が多いと Top 14・Rugby Championship・PNC の
コンテンツが 50 件の外に押し出され、クライアントフィルタ後に 0 件になる。

## スコープ

対象:
- `lib/db/queries/matches.ts` の `getRecentlyReviewedMatchesForFamily` — フィルタを DB 側に移動

対象外:
- 表示 UI（`app/c/[competition]/page.tsx`）の変更
- `limit(50)` を単純に増やすだけの workaround

## データモデル変更

なし

## API サーフェス

### `getRecentlyReviewedMatchesForFamily` のクエリ改善

family フィルタを DB 側で行う。
PostgREST のネストした relation へのフィルタが使えない場合は
Supabase RPC に切り出す。

**アプローチ A（PostgREST フィルタ）**
```typescript
await client
  .from("match_content")
  .select(`match:matches!...( ..., competition:competitions!...(family, slug, name, season) )`)
  .eq("content_type", "recap")
  .eq("language", "ja")
  .eq("status", "published")
  .eq("match.competition.family", family)  // DB 側フィルタ
  .order("generated_at", { ascending: false })
  .limit(limit);
```

**アプローチ B（SQL 関数 + RPC）**
`matches` と `competitions` を JOIN する SQL 関数を作成し
`.rpc("get_recent_recaps_for_family", { p_family: family, p_limit: limit })` で呼ぶ。

実装前に A の動作確認を行い、制限があれば B を採用する。

## UI サーフェス

なし

## LLM 連携

なし

## 受け入れ条件

1. `https://www.trylinerugby.com/c/top-14` に「最近のレビュー」セクションが表示される
2. `https://www.trylinerugby.com/c/rugby-championship` に同セクションが表示される
3. Six Nations・Premiership 等の既存大会ページで表示が壊れていない
4. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- PostgREST `.eq("match.competition.family", family)` が Supabase JS クライアントで
  動作するか事前に Supabase Studio の SQL エディタで確認すること
- PNC に公開済みレビューがそもそも存在するか確認してから受け入れ条件を調整すること
