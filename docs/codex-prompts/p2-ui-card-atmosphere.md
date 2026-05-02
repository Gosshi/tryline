# Codex Prompt: 試合カードのチームカラー背景演出

## 前提

`p2-ui-team-stripe-border.md` が完了済み。
`lib/format/team-identity.ts` に `getTeamColor`・`getTeamStripe` が実装済み。
`components/match-card.tsx` に左右ストライプボーダーが実装済み。

---

## 背景

現在の試合カードは白背景のみで、チームカラーは 4px のストライプボーダーにしか
現れていない。BBC Sport や Sofascore はホームチームのカラーを 4-8% opacity で
カード背景に使うことで、ロゴなしでもチームのアイデンティティを視覚化している。
この手法をカードに適用し臨場感を加える。

---

## 変更対象ファイル

- `components/match-card.tsx`

---

## Task 1 — インポート変更

```tsx
// 変更前
import { getTeamFlag, getTeamStripe } from "@/lib/format/team-identity";

// 変更後（getTeamColor を追加）
import { getTeamColor, getTeamFlag, getTeamStripe } from "@/lib/format/team-identity";
```

---

## Task 2 — `<article>` のスタイル変更

`bg-white` クラスを削除し、ホーム・アウェイそれぞれのチームカラーを
両端から引き込む背景グラデーションを `style` prop で設定する。

```tsx
// 変更前
<article className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">

// 変更後（bg-white を削除し style を追加）
<article
  className="relative h-full overflow-hidden rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
  style={{
    background: `linear-gradient(to right, ${getTeamColor(match.homeTeam.slug)}0a 0%, #ffffff 35%, #ffffff 65%, ${getTeamColor(match.awayTeam.slug)}0a 100%)`,
  }}
>
```

`0a` は hex alpha で約 4% opacity。視覚的に弱い場合は `12`（7%）まで調整してよい。
強すぎる場合は `08`（3%）に下げる。

---

## 完了条件

- [ ] 各試合カードがホーム・アウェイのチームカラーを両端にかすかに持つ
- [ ] England（赤）× France（紺）など対戦カードごとに色の組み合わせが異なる
- [ ] 白背景と比較してテキストの可読性が損なわれていない
- [ ] ホバー時のボーダー変化（`hover:border-slate-300`）が引き続き機能している
- [ ] モバイル（375px）でカードが正常に表示される
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- ストライプボーダー（`absolute inset-y-0 left-0 w-[4px]` など）
- カードのグリッドレイアウト・パディング
- `shadow-sm` / `rounded-xl` などの形状クラス
- ホバー時の `-translate-y-0.5` アニメーション
- スコア・チーム名・日時・会場のテキスト
