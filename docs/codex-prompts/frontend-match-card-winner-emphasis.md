# frontend-match-card-winner-emphasis: 試合カードの勝者強調強化

## 背景

サイト評価で「勝者チームのスコアを bold / accent color で強調する（現状は両チーム同一フォントウェイト）」
「カード左ボーダーカラーの意味が不明瞭」が指摘された。

現状の `components/match-card.tsx` は:
- 勝者スコア: `text-[var(--color-ink)]`（フルカラー）
- 敗者スコア: `text-[var(--color-ink-muted)]`（ミュート）
- 左右ボーダー: ホーム/アウェイのチームカラー（勝敗と無関係）

差分は存在するが弱い。以下の改善を加える。

## 変更内容: `components/match-card.tsx`

### 1. 勝者スコアを accent color + 大きさで強調

スコア表示部分（`font-display text-3xl`）を以下のように変更する:

```tsx
<span
  className={
    homeWon
      ? "text-[var(--color-accent)] text-4xl font-black"
      : awayWon
        ? "text-[var(--color-ink-muted)] text-3xl"
        : "text-[var(--color-ink)] text-3xl"
  }
>
  {match.homeScore ?? 0}
</span>
<span className="mx-1 text-[var(--color-rule)]">–</span>
<span
  className={
    awayWon
      ? "text-[var(--color-accent)] text-4xl font-black"
      : homeWon
        ? "text-[var(--color-ink-muted)] text-3xl"
        : "text-[var(--color-ink)] text-3xl"
  }
>
  {match.awayScore ?? 0}
</span>
```

### 2. 左右ボーダーを勝敗で強調/減衰

試合終了時は勝者側ボーダーを強調し、敗者側を薄くすることで結果を視覚的に示す。
引き分けまたは未終了はそのまま（現状維持）。

```tsx
<div
  aria-hidden
  className="absolute inset-y-0 left-0 w-[4px]"
  style={{
    background: getTeamStripe(match.homeTeam.slug, "vertical"),
    opacity: match.status === "finished" && awayWon ? 0.25 : 1,
  }}
/>
<div
  aria-hidden
  className="absolute inset-y-0 right-0 w-[4px]"
  style={{
    background: getTeamStripe(match.awayTeam.slug, "vertical"),
    opacity: match.status === "finished" && homeWon ? 0.25 : 1,
  }}
/>
```

### 3. 勝者 shortCode の横に W バッジを追加

```tsx
{/* ホームチーム名の行 */}
<p className={cn("flex items-center justify-end gap-1.5 text-base font-bold sm:text-xl", ...)}>
  <FlagIcon slug={match.homeTeam.slug} size={16} />
  {match.homeTeam.shortCode}
  {homeWon && match.status === "finished" && (
    <span className="rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--color-accent)]">
      W
    </span>
  )}
</p>
```

アウェイチーム側も同様に `awayWon` で判定して追加する。

## 完了条件

- `pnpm tsc --noEmit` パス
- 試合一覧で勝者スコアが accent color かつ大きく表示され、敗者がミュートになる
- 勝者側ボーダーが強調、敗者側が薄くなる
- 勝者 shortCode の横に "W" バッジが表示される
- 引き分け・未終了試合の表示が崩れない

## ブランチ・PR

- ブランチ: `feat/match-card-winner-emphasis`
- PR タイトル: `Feat: emphasize winner in match card with accent color and W badge`
