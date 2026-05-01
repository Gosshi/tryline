# Codex Prompt: 試合詳細ページの MatchHeader にチームカラー帯を追加

## 前提

`p2-design-tokens.md` が完了していること。`lib/format/team-identity.ts` に `getTeamColor(slug: string): string` が実装済みであること（`match-card.tsx` で使用されている）。

---

## 背景

現在の `components/match-header.tsx` は全体が白一色（`bg-white`）で、BBC Sport や ESPN のスコアカードと比べてスポーツらしいアイデンティティがない。`match-card.tsx` ではホームチームカラーを `border-l-4` として使っているが、試合詳細ページのスコアヘッダーでは一切チームカラーが使われていない。

ヘッダー上部に 4px のチームカラーバーを追加することで、チームアイデンティティを視覚的に表現する。

---

## 変更対象ファイル

`components/match-header.tsx` のみ

---

## Task 1 — import に `getTeamColor` を追加

ファイル冒頭のimportに追加する：

```tsx
import { getTeamColor, getTeamFlag } from "@/lib/format/team-identity";
```

（既に `getTeamFlag` がインポートされている場合は、`getTeamColor` を追記するだけでよい）

---

## Task 2 — `<section>` にチームカラーの top border を追加

### 変更前

```tsx
export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);
  const outcome = getMatchOutcome(match);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
```

### 変更後

```tsx
export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);
  const outcome = getMatchOutcome(match);
  const homeColor = getTeamColor(match.homeTeam.slug);

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50"
      style={{ borderTopColor: homeColor, borderTopWidth: "4px" }}
    >
```

**変更のポイント:**
- `borderTopColor` にホームチームのカラーを適用
- `borderTopWidth: "4px"` で `match-card` の `border-l-4`（4px）と同じ太さに統一
- `className` への変更は不要（inline style で既存の `border border-slate-200` を上書きする）

---

## 完了条件

- [ ] 試合詳細ページのスコアカード上部に 4px のホームチームカラー帯が表示される
  - 例: France vs Wales → 青（France）の帯
  - 例: Ireland vs England → 緑（Ireland）の帯
- [ ] カードの角丸（`rounded-xl`）が維持されている（帯が角に沿って丸くなる）
- [ ] `getTeamColor` が未知のスラグに対してフォールバック値を返す場合でも、表示が崩れない
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `MatchHeader` のレイアウト構造（grid、items-center 等）
- スコア表示のフォント・サイズ
- `TeamBlock` コンポーネント
- その他 `components/` 以下のファイル
