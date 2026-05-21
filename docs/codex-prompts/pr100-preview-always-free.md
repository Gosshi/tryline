# PR #100 — プレビューを常に全文無料表示にする

## 背景

プレビュー（試合前記事）は AI コンテンツの質を体験させる導線として機能させたい。
「プレビュー無料 → 面白い → レビューも読みたい → 課金」というファネルを成立させるため、
プレビューのペイウォールを撤廃し全文を無料表示にする。
レビュー（試合後記事）は引き続きペイウォールあり。

## スコープ

対象:
- `app/matches/[id]/page.tsx`

対象外:
- `components/match-content.tsx` の変更なし
- レビューのペイウォール挙動は変更しない

---

## 変更仕様

`app/matches/[id]/page.tsx` でプレビューを表示する `MatchContentSection`（1つ目）の
`isPremium` prop を常に `true` にする。

```tsx
// Before
<MatchContentSection
  ...
  isPremium={premium}
  showCta={publishedContent.recap === null}
/>

// After
<MatchContentSection
  ...
  isPremium={true}
  showCta={false}
/>
```

- `isPremium={true}` にすることで `isLocked` が常に `false` になり、全文が表示される
- `showCta={false}` にすることで不要な CTA が出ないようにする

---

## 完了の定義

- [ ] プレビューが非会員ユーザーにも全文表示される
- [ ] プレビューに「Premium で全文を読む」CTA が表示されない
- [ ] レビューのペイウォール挙動は変わらない
- [ ] TypeScript エラーなし・`pnpm build` 通過
