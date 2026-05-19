# PR #76 — 英語コンテンツの案内をホーム・大会ページに追加

## 前提

PR #74 が完了していること（`/matches/[id]/en` が存在する）。

## 背景

リーグワンの試合に英語コンテンツがあることをユーザーに伝える。
ホームページの大会アーカイブカードと、リーグワン大会ページのヘッダーに案内を追加する。

## スコープ

対象:
- `app/page.tsx` — 大会アーカイブのリーグワンカードに「EN」バッジを追加
- `app/c/[family]/[season]/page.tsx` — リーグワン大会ページに英語コンテンツ案内を追加

対象外:
- 他大会のページは変更しない
- ナビゲーションバーは変更しない

## 変更内容

### ホームページ — 大会アーカイブカード（`app/page.tsx`）

リーグワン（`competition.family === 'league-one'`）のカードのみ「EN」バッジを追加:

```tsx
<div className="flex items-center gap-2">
  <span className="block font-semibold text-[var(--color-ink)]">
    {formatFamilyName(competition.family)}
  </span>
  {competition.family === "league-one" && (
    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
      EN
    </span>
  )}
</div>
```

### リーグワン大会ページ（`app/c/[family]/[season]/page.tsx`）

`family === 'league-one'` の場合のみ、試合リストの上に一行追加:

```tsx
{family === "league-one" && (
  <p className="text-xs text-[var(--color-ink-muted)]">
    🌐 English match reviews available — select a match to read in English
  </p>
)}
```

## 完了の定義

- [ ] ホームの大会アーカイブでリーグワンカードに「EN」バッジが表示される
- [ ] 他大会のカードには「EN」バッジが表示されない
- [ ] リーグワン大会ページに英語コンテンツの案内文が表示される
- [ ] TypeScript エラーなし・`pnpm build` 通過
