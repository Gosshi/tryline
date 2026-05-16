# モバイルでのシーズン名ハイフン改行対策

## 背景

ホームページの「最新シーズン」カードで、
モバイル（375px）表示時にシーズン名が「Premiership 2025-」/ 「-26」と
ハイフン位置で改行されて見切れる。

原因: CSS のデフォルト挙動でハイフン前後で行折り返しが発生する。

## スコープ

対象:
- `app/page.tsx` — ホームページ「最新シーズン」カード（L274付近）

対象外:
- `lib/format/competition.ts` の `formatCompetitionTitle` 関数本体は変更しない

## 変更内容

### `app/page.tsx`（L274付近）

変更前:
```tsx
<p className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)] sm:text-4xl">
  {formatCompetitionTitle(
    latestCompetition.name,
    latestCompetition.season,
  )}
</p>
```

変更後（シーズン番号を `whitespace-nowrap` で保護）:
```tsx
<p className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)] sm:text-4xl">
  {latestCompetition.name.includes(latestCompetition.season)
    ? <span className="whitespace-nowrap">{latestCompetition.name}</span>
    : (
        <>
          {latestCompetition.name}{" "}
          <span className="whitespace-nowrap">{latestCompetition.season}</span>
        </>
      )
  }
</p>
```

`formatCompetitionTitle` の import が不要になった場合は削除する。

## 受け入れ条件

- [ ] 375px ビューポートで「Premiership 2025-26」が「2025-」/ 「-26」と分断されない
- [ ] デスクトップ（1280px）での表示が崩れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
