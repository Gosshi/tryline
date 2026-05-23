# 試合カード: プレビュー・レビューありバッジの表示

## 背景

`components/match-card.tsx` は `contentStatus?: MatchContentStatus` を受け取り、
`shouldShowContentStatus` 変数で表示条件を計算している。
しかし評価時点でシーズンページ・ホームページの試合カードにバッジが表示されていなかった。

ユーザーはどの試合にコンテンツが存在するか分からないため、
試合ページへの回遊が発生しない状態が続いている。

## スコープ

対象:
- `components/match-card.tsx` — バッジ表示 UI の実装確認・追加
- `app/c/[competition]/[season]/page.tsx` — 各試合カードに `contentStatus` を渡しているか確認
- `lib/db/queries/match-content.ts` — `MatchContentStatus` 一括取得クエリの確認・追加

対象外:
- ホームの「最近のレビュー」セクション（既に表示済み）

## データモデル変更

なし

## API サーフェス

### `getContentStatusForMatches`（存在しない場合は追加）

```typescript
// lib/db/queries/match-content.ts
export async function getContentStatusForMatches(
  matchIds: string[],
): Promise<Record<string, MatchContentStatus>>
```

`match_content` テーブルから `match_id, content_type` を一括取得し
（N+1 を避けるため `match_id IN (...)` で一括クエリ）、
`status = 'published'` のものを集計して `hasPreview` / `hasRecap` を返す。

## UI サーフェス

### バッジ（`components/match-card.tsx`）

```tsx
{shouldShowContentStatus && (
  <div className="mt-3 flex gap-1.5">
    {contentStatus.hasPreview && (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
        プレビューあり
      </span>
    )}
    {contentStatus.hasRecap && (
      <span className="rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
        レビューあり
      </span>
    )}
  </div>
)}
```

### 呼び出し側

`app/c/[competition]/[season]/page.tsx` で全試合 ID を一括取得して
`getContentStatusForMatches` を呼び、各 `MatchCard` に `contentStatus` を渡す。

## LLM 連携

なし

## 受け入れ条件

1. 公開済みレビューがある試合カードに「レビューあり」バッジが表示される
2. プレビューのみの試合カードに「プレビューあり」バッジが表示される
3. コンテンツがない試合カードにバッジが表示されない
4. Playwright でシーズンページのスクリーンショットを撮り確認
5. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `getContentStatusForMatches` が既に `lib/db/queries/match-content.ts` に存在するか確認し、
  存在しなければ追加すること