# fix: 終了済み試合のプレビュー枠を非表示にする

## 問題

試合が終了（`status === "finished"`）しているにもかかわらずプレビューが生成されていない場合、
試合詳細ページに「プレビューを準備中です」というプレースホルダーが表示される。
試合終了後にプレビューを準備することはないため、このメッセージは誤解を招く。

## 修正方針

### 1. `deriveContentState` の修正

`lib/match-content/state.ts`

`preview` タイプかつ `matchStatus === "finished"` の場合は `"unavailable"` を返す。

現在の実装では `finished` が `scheduled` でも `in_progress` でもないため、
`preview` のケースで `"preparing"` にフォールスルーしている。これを修正する。

```ts
if (contentType === "preview") {
  // 試合終了後はプレビュー不要
  if (matchStatus === "finished") {
    return "unavailable";
  }

  const previewWindowStartAt = kickoffAt.getTime() - FORTY_EIGHT_HOURS_MS;

  if (matchStatus === "scheduled" && now.getTime() < previewWindowStartAt) {
    return "pre_window";
  }

  return "preparing";
}
```

### 2. 試合詳細ページのプレビューセクション非表示

`app/matches/[id]/page.tsx` の `<section className="space-y-4">` 内で、
`match.status === "finished"` かつ `publishedContent.preview === null` のときは
プレビューの `MatchContentSection` を描画しない。

```tsx
<section className="space-y-4">
  {!(match.status === "finished" && !publishedContent.preview) && (
    <MatchContentSection
      content={publishedContent.preview}
      contentType="preview"
      match={match}
    />
  )}
  <MatchContentSection
    content={publishedContent.recap}
    contentType="recap"
    match={match}
  />
</section>
```

## 変更するファイル

- `lib/match-content/state.ts` — `finished` + `preview` → `"unavailable"` を返す
- `app/matches/[id]/page.tsx` — 終了済み + プレビューなしのとき枠を非表示

## 変更しないこと

- `components/match-content-section.tsx`
- `components/content-placeholder.tsx`
- `lib/db/queries/match-content.ts`

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- 試合詳細ページ（finished + preview null）でプレビュー枠が表示されないこと
- 試合詳細ページ（scheduled）では引き続きプレビュー枠が表示されること

## ブランチ・PR

- ブランチ: `fix/preview-section-visibility`
- PR タイトル: `Fix: hide preview section for finished matches without preview`
