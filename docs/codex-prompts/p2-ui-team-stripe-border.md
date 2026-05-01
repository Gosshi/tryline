# Codex Prompt: チームカラーボーダーを国旗縞模様に変更

## 前提

`p2-design-tokens.md` および `p2-ui-match-header-colors.md` が完了済み。
`lib/format/team-identity.ts` に `getTeamColor` が実装済み。

---

## 背景

現在のボーダーカラーは単色のため、England と Wales（どちらも赤）、France と Scotland
（どちらも紺）が見分けにくい。各チームの国旗の縞模様を CSS グラデーションで表現することで
チームアイデンティティを明確にする。

---

## 変更対象ファイル

- `lib/format/team-identity.ts`
- `components/match-card.tsx`
- `components/match-header.tsx`

---

## Task 1 — `lib/format/team-identity.ts`：縞模様データと関数を追加

### 各チームの縞カラー

```typescript
const TEAM_STRIPES: Record<string, string[]> = {
    england:  ["#CC0000", "#FFFFFF"],           // 赤-白（セントジョージ）
    france:   ["#002395", "#FFFFFF", "#ED2939"], // 青-白-赤
    ireland:  ["#169B62", "#FFFFFF", "#F77F00"], // 緑-白-橙
    italy:    ["#009246", "#FFFFFF", "#CE2B37"], // 緑-白-赤
    scotland: ["#003F87", "#FFFFFF"],            // 青-白（セントアンドリュー）
    wales:    ["#C8102E", "#FFFFFF", "#00712D"], // 赤-白-緑
  };
```

### 追加するエクスポート関数

```typescript
export function getTeamStripe(
  slug: string,
  direction: "vertical" | "horizontal" = "vertical",
): string {
  const colors = TEAM_STRIPES[slug];
  if (!colors) return "#94a3b8";
  const dir = direction === "vertical" ? "to bottom" : "to right";
  const n = colors.length;
  const stops = colors.flatMap((c, i) => [
    `${c} ${Math.round((i / n) * 100)}%`,
    `${c} ${Math.round(((i + 1) / n) * 100)}%`,
  ]);
  return `linear-gradient(${dir}, ${stops.join(", ")})`;
}
```

`getTeamColor` は削除しない（`match-header.tsx` のグラデーション背景と
`match-events-section.tsx` のタイムラインバーで引き続き使用）。

---

## Task 2 — `components/match-card.tsx`：左ボーダーを縞グラデーションに変更

### 変更方針

CSS ボーダーはグラデーションを直接受け付けないため、`border-l-4` を廃止し、
`<article>` 内に絶対配置の縞ストリップ `<div>` を追加する。

### インポート変更

```tsx
// 変更前
import { getTeamColor, getTeamFlag } from "@/lib/format/team-identity";

// 変更後
import { getTeamFlag, getTeamStripe } from "@/lib/format/team-identity";
```

### `<article>` の変更

```tsx
// 変更前
<article
  className="h-full rounded-xl border border-l-4 border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
  style={{ borderLeftColor: getTeamColor(match.homeTeam.slug) }}
>

// 変更後（relative + overflow-hidden を追加、border-l-4 と borderLeftColor を削除）
<article className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
  <div
    aria-hidden
    className="absolute inset-y-0 left-0 w-[4px]"
    style={{ background: getTeamStripe(match.homeTeam.slug, "vertical") }}
  />
```

`</article>` の閉じタグ位置は変えない。

---

## Task 3 — `components/match-header.tsx`：上ボーダーを縞グラデーションに変更

### インポート変更

```tsx
// 変更前
import { getTeamColor, getTeamFlag } from "@/lib/format/team-identity";

// 変更後
import { getTeamColor, getTeamFlag, getTeamStripe } from "@/lib/format/team-identity";
```

（`getTeamColor` はグラデーション背景で引き続き使用するため残す）

### `<section>` の変更

```tsx
// 変更前
<section
  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50"
  style={{ borderTopColor: homeColor, borderTopWidth: "4px" }}
>

// 変更後（borderTopColor / borderTopWidth を削除し、内側に絶対配置ストリップを追加）
<section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
  <div
    aria-hidden
    className="absolute inset-x-0 top-0 h-[4px]"
    style={{ background: getTeamStripe(match.homeTeam.slug, "horizontal") }}
  />
```

`homeColor` の変数と `getTeamColor` の呼び出しはグラデーション背景のために残す。

---

## 完了条件

- [ ] 試合カード左端に 4px の縞グラデーションが表示される
  - England: 赤-白（縦）
  - France: 青-白-赤（縦）
  - Wales: 赤-白-緑（縦）— England と明確に区別できる
  - Scotland: 青-白（縦）— France と明確に区別できる
- [ ] 試合詳細ページのスコアカード上端に 4px の縞グラデーションが表示される（横方向）
- [ ] カードの `border-l-4` が消えて `overflow-hidden` で縞がカード外にはみ出さない
- [ ] `getTeamColor` は削除されず、既存の呼び出し箇所が壊れない
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `match-events-section.tsx`（タイムラインバーは 3px 幅のため縞は不要）
- `getTeamColor` 関数（削除禁止）
- `match-header.tsx` のグラデーション背景（`${homeColor}18`）
- カードのレイアウト構造（grid、items-center 等）
