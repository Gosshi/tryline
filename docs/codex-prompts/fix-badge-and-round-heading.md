# Codex Prompt: 終了バッジ整理 & ラウンド見出し強化

## 背景

UI 監査で以下の 2 件が指摘された。

1. マッチカードの「終了」バッジが冗長。スコアが表示されていれば試合終了は自明であり、バッジが不要なノイズになっている
2. ラウンド見出し（Round 1 等）が `text-xs text-slate-400` で非常に薄く、セクションの区切りとして視認しにくい

---

## Task 1 — `components/match-card.tsx`: `finished` 時にバッジを非表示

### 現状

```tsx
<StatusBadge status={match.status} />
```

`finished` を含む全ステータスで常にバッジが表示される。

### 変更内容

`match.status === "finished"` のときだけバッジをレンダリングしない。他のステータス（`scheduled`, `in_progress`, `postponed`, `cancelled`）は引き続き表示する。

```tsx
{match.status !== "finished" && <StatusBadge status={match.status} />}
```

### 完了条件

- [ ] `finished` 試合のカードにバッジが表示されない
- [ ] `scheduled` / `in_progress` / `postponed` / `cancelled` のカードはバッジが表示される
- [ ] `pnpm tsc --noEmit` がパスする

---

## Task 2 — `components/round-heading.tsx`: 見出しを視覚的に強化

### 現状

```tsx
<h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
  {round === null ? "節未定" : `Round ${round}`}
</h2>
```

`text-xs text-slate-400` で非常に薄い。

### 変更内容

フォントサイズと色を強化し、セクションの区切りとして視認しやすくする。

```tsx
<h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600">
  {round === null ? "節未定" : `Round ${round}`}
</h2>
```

変更点: `text-xs` → `text-sm`、`font-semibold` → `font-bold`、`text-slate-400` → `text-slate-600`。

区切り線（`<div className="h-px flex-1 bg-slate-200" />`）はそのまま残す。

### 完了条件

- [ ] ラウンド見出しが `text-sm font-bold text-slate-600` で表示される
- [ ] 区切り線のスタイルに変化なし
- [ ] `pnpm tsc --noEmit` がパスする

---

## 変更しないこと

- `StatusBadge` コンポーネント本体（`status-badge.tsx`）
- マッチカードのスコア表示・勝敗カラーロジック
- `RoundHeading` の区切り線・レイアウト構造
