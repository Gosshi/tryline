# Codex プロンプト: 選手ページを当面すべて noindex にする

仕様: `specs/fix-player-pages-noindex-until-stats.md` を参照。

## タスク

選手ページにスタッツが無い間、実名選手も含め全選手ページを検索インデックスから外す。#359 の定義(b) は温存し、フィーチャーフラグで切り替え可能にする。

## 変更内容

### `lib/db/queries/players.ts`

`isIndexablePlayer()`（L101 付近）の先頭にフラグによる早期 return を追加（既存ロジックは消さない）:

```typescript
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

これだけで以下が連動する（追加変更不要）:
- `app/players/[slug]/page.tsx` の `generateMetadata` が全選手に `robots: { index: false, follow: true }` を付与
- `listIndexablePlayerSlugs()` が空配列を返し sitemap から全選手が消える

## テスト

`isIndexablePlayer` の既存テスト（`lib/db/queries/players.test.ts` 等）を更新:
- フラグ `false` の現状: 実名・出場あり・canonical の「本来 indexable」な入力でも `false` を返すことを検証
- 定義(b)ロジック自体の回帰は、テスト内でフラグを切り替えるか、内部ロジック関数を分離して直接テストする形でカバー（既存テストを消さない）

sitemap のテストがあれば「選手 URL が0件」を確認。

## 完了の定義

- `pnpm typecheck` / `pnpm test` が通る
- 変更ファイル: `lib/db/queries/players.ts` と関連テストのみ
- 選手ページの表示・チームページの挙動は変えない
- **PR の base は必ず `main` にすること**
