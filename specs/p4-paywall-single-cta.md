# Paywall CTA の重複解消

## 背景

試合詳細ページ（`app/matches/[id]/page.tsx`）では、
プレビューセクションとレビューセクションの2つが `MatchContentSection` を使って表示される。
どちらも `MatchContent` 内にロックされた場合の CTA を持つため、
非プレミアムユーザーには「Premium を始める - ¥980/月」ボタンが2箇所表示される。
同じページに同じ CTA が2回あると誠実さが損なわれ UI も雑然とする。

## スコープ

対象:
- `components/match-content.tsx` — CTA を props で制御できるように変更
- `components/match-content-section.tsx` — CTA 表示有無を渡す変更
- `app/matches/[id]/page.tsx` — 最後のセクションにのみ CTA を渡す変更

対象外:
- Paywall のグラデーションフェード・「次のセクション」ヒント（変更なし）
- プレミアムユーザーの表示（変更なし）

## 変更内容

### 方針

プレビューとレビューが両方表示される場合、CTA は**最後のセクション（レビュー）にのみ表示**する。
プレビューのみ表示される場合はプレビューに CTA を表示する。

### `components/match-content.tsx`

`MatchContentProps` に `showCta?: boolean`（デフォルト `true`）を追加する。

```tsx
type MatchContentProps = {
  content: ...;
  isPremium: boolean;
  showCta?: boolean;  // 追加
};

// isLocked && showCta !== false の場合のみ CTA を表示
{isLocked && showCta !== false && (
  <div className="mt-4 flex flex-col items-center gap-3 text-center">
    ...
  </div>
)}
```

### `components/match-content-section.tsx`

`MatchContentSectionProps` に `showCta?: boolean` を追加し、`MatchContent` へ渡す。

### `app/matches/[id]/page.tsx`

```tsx
// プレビューセクション: レビューがある場合は CTA を出さない
<MatchContentSection
  content={publishedContent.preview}
  contentType="preview"
  isPremium={premium}
  match={match}
  showCta={publishedContent.recap === null}
/>

// レビューセクション: showCta はデフォルト true
<MatchContentSection
  content={publishedContent.recap}
  contentType="recap"
  isPremium={premium}
  match={match}
/>
```

## 変更ファイル

- `components/match-content.tsx`
- `components/match-content-section.tsx`
- `app/matches/[id]/page.tsx`

## 受け入れ条件

- [ ] 非プレミアムユーザーが試合詳細を開いた際、「Premium を始める」ボタンがページ内で1箇所のみ表示される
- [ ] プレビューのみ存在する試合（recap なし）では、プレビューセクションに CTA が表示される
- [ ] レビューが存在する試合では、レビューセクションに CTA が表示され、プレビューには表示されない
- [ ] プレミアムユーザーには引き続き CTA が表示されない
- [ ] グラデーションフェードは変更なし
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
