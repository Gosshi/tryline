# 選手ページを当面すべて noindex にする（スタッツ実装までの暫定）

## 背景

`fix-index-bloat-players-teams.md`（#359 で実装済み）は、匿名 `player-<hash>` ページを noindex/sitemap 除外し、「実名 AND published 試合に1回以上出場」した選手のみ index 対象とする定義(b)を採用した。

しかし 2026-06-13 に本番 sitemap を実測したところ、選手ページが依然 **1,392件** 含まれていた。定義(b)で indexable と判定された実名選手が1,392人いたためである。さらに実ページ（例: `/players/aaron-shingler`）を確認すると、内容は「所属チーム名」と「出場試合1件のリンク」のみで、スタッツ・経歴・固有テキストは皆無のテンプレートだった。

つまり匿名ページは消えたが、**「実名だが中身が空」の薄いページが1,392件 index 対象として残存**しており、index bloat が形を変えて生き残っている。ゼロ権威ドメインのクロールバジェットが本命の recap（published 約1,079本）ではなく薄い選手ページに食われる構造は #359 前と本質的に変わっていない。

Owner 決定（2026-06-13）: 選手ページにスタッツを実装するまで、**実名選手も含め全選手ページを当面 noindex** とし、クロールバジェットを recap に集中させる。選手名の日本語検索需要は現状ほぼゼロのため、失う流入は小さい。

## スコープ

対象:
- `lib/db/queries/players.ts` の `isIndexablePlayer()` にフィーチャーフラグを追加し、当面すべて非 indexable を返す

対象外:
- 既存の実名/出場判定ロジックの削除（温存する。フラグを戻せば定義(b)が復活する設計）
- 選手ページの表示・削除（従来どおり閲覧可能のまま。検索からのみ外す）
- チームURL二重化（#359 で対応済み・本 spec では不変）
- `feat-player-stats`（選手ページにスタッツを足してインデックス価値を持たせる施策。本 spec のフラグを将来 true に戻す前提条件・別 spec）

## データモデル変更

なし（判定ロジックの分岐追加のみ）。

## 変更詳細

### `lib/db/queries/players.ts`

`isIndexablePlayer()`（L101）の先頭にフラグによる早期 return を追加する。既存ロジックは温存し、将来 `feat-player-stats` 実装時にフラグを `true` に戻すだけで定義(b)が復活するようにする。

```typescript
// 選手ページにスタッツ等の固有コンテンツが無い間は、実名選手であっても
// index しない（薄いページのクロールバジェット消費を防ぐ）。
// feat-player-stats 実装後に true へ戻すと、下の定義(b)が復活する。
const PLAYER_PAGES_INDEXABLE = false;

export function isIndexablePlayer(
  player: Pick<
    PlayerDetail,
    "canonicalSlug" | "hasPublishedContentMatch" | "slug"
  >,
): boolean {
  if (!PLAYER_PAGES_INDEXABLE) {
    return false;
  }

  return (
    player.canonicalSlug === null &&
    player.hasPublishedContentMatch &&
    isResolvedPlayerSlug(player.slug)
  );
}
```

この1箇所の変更で、`app/players/[slug]/page.tsx`（L53）の `generateMetadata` が全選手に `robots: { index: false, follow: true }` を付与し、`listIndexablePlayerSlugs()`（L381 付近・`isIndexablePlayer` で絞る）が空配列を返して sitemap から全選手が外れる。

## 受け入れ条件

1. `https://www.trylinerugby.com/sitemap.xml` に `/players/` URL が**1件も含まれない**（デプロイ後・Owner 確認）
2. 任意の選手ページ（実名選手含む）が `<meta name="robots" content="noindex, follow">` を返す
3. 選手ページは従来どおり 200 で表示される（削除・リダイレクトしない）
4. チームページ（`/teams/[slug]` canonical・`/t/` 301）の挙動は #359 のまま変わらない
5. `isIndexablePlayer()` があらゆる入力で `false` を返す単体テスト。既存の定義(b)テストは「フラグ false 前提」に更新するか、フラグを切り替えてロジックを検証する形に整える
6. `pnpm test` / `pnpm typecheck` が通る

## 将来の含み

- `feat-player-stats`（トライ数・出場試合数等を選手ページに表示）を実装したら `PLAYER_PAGES_INDEXABLE = true` に戻す。これで定義(b)（実名 AND published出場）が自動復活し、中身のある選手ページが再び index 対象になる。
- スタッツのデータ源は match_events だが、イベント品質（過剰/欠落）の課題があるため、feat-player-stats 側で集計の信頼性を担保すること。
