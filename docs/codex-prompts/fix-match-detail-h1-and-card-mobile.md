# Codex Prompt: 試合詳細 h1 追加 & マッチカードモバイル修正

## 背景

UI 監査で以下の 2 件が指摘された。

1. `/matches/[id]` ページに `<h1>` が存在しない（SEO・アクセシビリティ違反）
2. ホームページのマッチカードが 375px でチーム名を省略表示している

---

## Task 1 — `components/match-header.tsx` に `<h1>` を追加

### 現状

`MatchHeader` の最上部セクションにはラウンド情報と `<StatusBadge>` のみが置かれており、試合名を表す `<h1>` が存在しない。チーム名は `<TeamBlock>` 内の `<p>` として描画されている。

### 変更内容

`<section>` の先頭（`border-b の div` の前）に視覚非表示の `<h1>` を追加する。

```tsx
<h1 className="sr-only">
  {match.homeTeam.name} vs {match.awayTeam.name}
</h1>
```

`sr-only` でスクリーンリーダー専用とする。視覚的には既存のスコアブロックが「見出し」として機能しているため、重複した視覚表示は追加しない。

### 完了条件

- [ ] `/matches/[id]` の DOM に `<h1>` が 1 つ存在する
- [ ] `<h1>` の内容が `{homeTeam.name} vs {awayTeam.name}` である
- [ ] 視覚的レイアウトに変化なし
- [ ] `pnpm tsc --noEmit` がパスする

---

## Task 2 — `components/match-card.tsx` モバイル表示修正

### 現状

`<article>` 内のスコアグリッドは `grid-cols-[1fr_auto_1fr]` で、チーム表示セルが `minmax(0, 1fr)` に収まる。フラグ + shortCode の `<p>` は `text-xl font-bold` だが、375px でテキストがセル幅を超えて省略される。

現在の構造（ホーム側）:

```tsx
<p className={cn("text-xl font-bold", ...)}>
  {getTeamFlag(match.homeTeam.slug)} {match.homeTeam.shortCode}
</p>
```

### 変更内容

フラグ + shortCode の行を `text-base sm:text-xl` に変更し、`truncate` を追加する。ホーム・アウェイ両方に適用する。

ホーム側:

```tsx
<p className={cn("truncate text-base font-bold sm:text-xl", ...)}>
  {getTeamFlag(match.homeTeam.slug)} {match.homeTeam.shortCode}
</p>
```

アウェイ側:

```tsx
<p className={cn("truncate text-base font-bold sm:text-xl", ...)}>
  {match.awayTeam.shortCode} {getTeamFlag(match.awayTeam.slug)}
</p>
```

チーム正式名（`text-xs` の行）は変更しない。

### 完了条件

- [ ] 375px 幅でフラグ + shortCode が省略されずに表示される
- [ ] 768px 以上で `text-xl` の表示が維持される
- [ ] `pnpm tsc --noEmit` がパスする

---

## 変更しないこと

- `match-header.tsx` の視覚的レイアウト（スコア・タイムゾーン表示など）
- `match-card.tsx` のスコア表示ロジック・勝敗による色分け
- ルーティング・データ取得ロジック
