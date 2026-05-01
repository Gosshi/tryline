# Codex Prompt: マッチカード・ラウンド見出し・順位表のデザイン改善

## 前提

`p2-design-tokens.md` が完了していること（`--font-fraunces`、`--font-noto-serif-jp`、`--color-*` の CSS 変数が利用可能）。

---

## 背景

デザイントークン導入後もカードが「フラットな白四角」に見える。Fraunces フォントをスコア数字に使い、カードに奥行きとホバー体験を与え、ラウンド見出しをエディトリアルにする。

---

## Task 1 — `components/match-card.tsx` を更新

### 変更点の概要

| 要素 | 変更前 | 変更後 |
|---|---|---|
| カード影 | なし | `shadow-sm`、hover で `shadow-md` |
| ホバー | 背景色変化のみ | `-translate-y-0.5 shadow-md` へのリフト |
| トランジション | `transition-colors` | `transition-all duration-150 ease-out` |
| スコア数字 | `font-bold`（システムフォント） | `font-display`（Fraunces） |
| 勝者スコア | `text-slate-950` | `text-[var(--color-ink)]` |
| 敗者スコア | `text-slate-400` | `text-[var(--color-ink-muted)]` |

### 具体的なコード変更

**`<Link>` の focus-visible リング色**:
```tsx
className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
```

**`<article>` のクラス**（`transition-colors hover:border-slate-400 hover:bg-slate-50` を置き換え）:
```tsx
className="h-full rounded-xl border border-l-4 border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
```

**スコア中央カラムの `<p>` クラス**:
```tsx
className={cn(
  "px-3 font-display text-3xl tabular-nums",
  match.status === "finished" ? "" : "text-[var(--color-rule)]",
)}
```

**勝者・敗者スコアの `<span>` クラス**:
- 勝者側 → `text-[var(--color-ink)]`
- 敗者側 → `text-[var(--color-ink-muted)]`
- 引き分け（両者） → `text-[var(--color-ink)]`
- セパレータ `–` → `text-[var(--color-rule)]`

完成後のスコアブロック全体:
```tsx
<p
  className={cn(
    "px-3 font-display text-3xl tabular-nums",
    match.status === "finished" ? "" : "text-[var(--color-rule)]",
  )}
>
  {match.status === "finished" ? (
    <>
      <span
        className={
          homeWon
            ? "text-[var(--color-ink)]"
            : awayWon
              ? "text-[var(--color-ink-muted)]"
              : "text-[var(--color-ink)]"
        }
      >
        {match.homeScore ?? 0}
      </span>
      <span className="mx-1 text-[var(--color-rule)]">–</span>
      <span
        className={
          awayWon
            ? "text-[var(--color-ink)]"
            : homeWon
              ? "text-[var(--color-ink-muted)]"
              : "text-[var(--color-ink)]"
        }
      >
        {match.awayScore ?? 0}
      </span>
    </>
  ) : (
    "—"
  )}
</p>
```

**チーム名の色クラス**（`awayWon ? "text-slate-400" : "text-slate-900"` など 4 箇所）:
- 通常・勝者側 → `text-[var(--color-ink)]`
- 敗者側 → `text-[var(--color-ink-muted)]`

---

## Task 2 — `components/round-heading.tsx` を更新

ラウンド番号をエディトリアルなセクション区切りに変える。

```tsx
export function RoundHeading({ round }: RoundHeadingProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--color-rule)]" />
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        {round === null ? "節未定" : `Round ${round}`}
      </h2>
      <div className="h-px flex-1 bg-[var(--color-rule)]" />
    </div>
  );
}
```

変更点:
- ルールを**両端**に配置（旧: 右のみ）
- `font-display`（Fraunces）で欧文数字に個性を持たせる
- カラーを `--color-rule` / `--color-ink-muted` トークンに統一

---

## Task 3 — `components/standings-table.tsx` を更新

### 変更点

1. **カードに `shadow-sm` を追加**
2. **1〜3位の行に微細なハイライト**
3. **ポイント列の数字を `font-display`（Fraunces）に変更**

```tsx
// セクションのクラスに shadow-sm を追加
<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
```

```tsx
// 各行: 順位によって背景を変える（cn をインポート済みの前提）
import { cn } from "@/lib/utils";

<tr
  className={cn(
    "border-b border-slate-50 last:border-0",
    row.position === 1
      ? "bg-emerald-50/60"
      : row.position <= 3
        ? "bg-slate-50/60"
        : "",
  )}
  key={row.position}
>
```

```tsx
// ポイント列の td を font-display に変更
<td className="py-2 text-right font-display font-bold tabular-nums text-[var(--color-ink)]">
  {row.totalPoints}
</td>
```

---

## 完了条件

- [ ] マッチカードのスコア数字が Fraunces（serif 体）で描画される
- [ ] カードをホバーすると `-translate-y-0.5 shadow-md` のリフト効果がある
- [ ] 敗者チームのスコアとチーム名が薄いグレー（`--color-ink-muted`）で表示される
- [ ] ラウンド見出しが両端ルール + Fraunces でエディトリアルに見える
- [ ] 順位表の 1 位行が薄いエメラルドのハイライト
- [ ] 順位表のポイント列が Fraunces で描画される
- [ ] `pnpm tsc --noEmit` がパスする

## 変更しないこと

- `match-card.tsx` のレイアウト構造（grid、items-center 等）
- `standings-table.tsx` のテーブル列構成
- `status-badge.tsx`
- `site-header.tsx`、`site-footer.tsx`
