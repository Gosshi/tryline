# 今後の試合カードへの競技ラベル強化

## 背景

ホームページの「今後の試合」セクションは全競技を kickoff_at 昇順で返すため、
URC・Premiership 等が混在して表示される。

現状、各カードに `formatFamilyName(family)` を `text-xs text-[var(--color-ink-muted)]` で
表示しているが、直上の「最新シーズン」カード（大きな "Premiership 2025-26" テキスト）と
視覚的に連続して見えるため、ユーザーが全件 Premiership と誤認する。

## スコープ

対象:
- `app/page.tsx` — 「今後の試合」セクションの各カード（L301-334付近）

対象外:
- `getUpcomingMatches` クエリ本体（全競技表示の方針は変えない）

## 変更内容

各カードの競技ラベルを muted テキストからカラーバッジに変更する。

変更前（L328-330付近）:
```tsx
<p className="truncate text-xs text-[var(--color-ink-muted)]">
  {formatFamilyName(family)}
</p>
```

変更後:
```tsx
<span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
  {formatFamilyName(family)}
</span>
```

## 受け入れ条件

- [ ] 各カードに競技名バッジ（例: 「プレミアシップ」「URC」）が視認しやすく表示される
- [ ] Premiership カードと URC カードが混在していても競技の違いが一目でわかる
- [ ] モバイル（375px）・デスクトップ（1280px）ともにレイアウトが崩れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
