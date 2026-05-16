# 英語セクションサブラベルの削除

## 背景

試合詳細ページの各セクションに英語のサブラベルが残っており、
日本語 UI に不自然に浮いている。

- `components/match-content-section.tsx`: "Match Preview" / "Match Review"
- `components/match-events-section.tsx`: "Scoring Timeline"
- `components/match-lineups-section.tsx`: "Team Sheets"

## スコープ

対象:
- `components/match-content-section.tsx`
- `components/match-events-section.tsx`
- `components/match-lineups-section.tsx`

対象外:
- セクションのメインタイトル（「プレビュー」「レビュー」等）は残す

## 変更内容

### 1. `components/match-content-section.tsx`

`SUBTITLES` 定数を削除し、以下の `<p>` タグを削除する（L43-45付近）:

```tsx
// 削除対象
<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
  {SUBTITLES[contentType]}
</p>
```

`TITLES`（「プレビュー」「レビュー」）と `<h2>` は残す。

### 2. `components/match-events-section.tsx`（L70付近）

"Scoring Timeline" を含む `<p>` または `<span>` タグを削除する。
セクション全体の構造は維持する。

### 3. `components/match-lineups-section.tsx`（L27付近）

"Team Sheets" を含む `<p>` または `<span>` タグを削除する。
セクション全体の構造は維持する。

## 受け入れ条件

- [ ] 試合詳細ページに "Match Preview" / "Match Review" / "Scoring Timeline" / "Team Sheets" が表示されない
- [ ] セクションのメインタイトル（「プレビュー」「レビュー」等）は引き続き表示される
- [ ] セクション全体のレイアウトが崩れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
