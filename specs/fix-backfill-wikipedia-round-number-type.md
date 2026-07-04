# backfill-nations-championship-wikipedia-urls: wikipedia_round の型不一致を修正

## 背景

`specs/backfill-nations-championship-wikipedia-urls.md`（PR #470、マージ済み）の実行時、本番dry-runで **NC 2026 の36試合が全件 `unsupported_round`（round: null）としてスキップされた**（本来は18+18件が対象になるはず）。

**根本原因**: `scripts/backfill-nations-championship-wikipedia-urls.ts` の `getWikipediaRound()` が内部で使う `getStringValue()` は `typeof value === "string"` の場合のみ値を返す。しかし本番確認済み（2026-07-04、`jsonb_typeof`で直接確認）: `matches.external_ids.wikipedia_round` は**JSON数値**（例: `1`）として保存されており、文字列（`"1"`）ではない。したがって `getWikipediaRound` は常に `null` を返し、`getNationsChampionshipWikipediaUrl` も常に `null` を返していた（`round === "1" || ...` という文字列比較が数値とは一致しないため）。

（参考: 元specの「未解決の質問」欄に「`wikipedia_round` に文字列 `"1"`〜`"6"` が設定済み」という記載があったが、これは誤りだった。実際は数値型）

## スコープ

対象:
- `scripts/backfill-nations-championship-wikipedia-urls.ts` の `getWikipediaRound()` を、文字列・数値どちらの型でも正しく判定できるように修正する
- 対応するテスト（数値型 `wikipedia_round` に対する既存テストケースを追加・修正）

対象外:
- 他のロジック（URL選定・イミュータブルマージ・dry-run規約等）の変更（既に正しく動作している）

## データモデル変更

なし。

## 実装方針（提案）

```typescript
function getWikipediaRound(externalIds: Json): string | null {
  const ids = asJsonObject(externalIds);
  const value = ids.wikipedia_round;

  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}
```

## 受け入れ条件

1. `wikipedia_round: 1`（数値）を持つ `external_ids` に対して `getNationsChampionshipWikipediaUrl` が Southern URL を返すことを単体テストで確認する
2. `wikipedia_round: 4`（数値）で Northern URL を返すことを確認する
3. `wikipedia_round: "1"`（文字列、後方互換）でも引き続き正しく動作することを確認する
4. 本番 dry-run（`node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-wikipedia-urls.ts`）で、NC 2026 の対象が18+18=36件になることを確認する（Owner側で実行して確認。Codexはローカルの単体テストのみでよい）
5. `pnpm test`・`pnpm tsc --noEmit` 通過

## 未解決の質問

なし。
