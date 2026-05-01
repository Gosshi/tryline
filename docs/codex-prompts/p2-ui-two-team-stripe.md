# Codex Prompt: カードと詳細ヘッダーを2チームカラー表示に変更

## 前提

`p2-ui-team-stripe-border.md` が完了済み。
`getTeamStripe` と `getTeamColor` が `lib/format/team-identity.ts` に実装済み。

---

## 背景

現在の縞ボーダーはホームチームのみを表示しており、対戦カードとしての視覚情報が不完全。
また試合詳細ページの上ボーダーはトリコロール国旗の白帯が「断裂」して見える問題がある。
以下の2点を修正し、ホーム・アウェイ両チームのアイデンティティを同時に表現する。

---

## 変更対象ファイル

- `components/match-card.tsx`
- `components/match-header.tsx`

---

## Task 1 — `components/match-card.tsx`：右端にアウェイチームの縞を追加

### 現状

カード左端の絶対配置ストリップがホームチームのみ。

### 変更後

左端（ホーム）に加え、右端（アウェイ）にも 4px の縞ストリップを追加する。

```tsx
// 変更前
<article className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
  <div
    aria-hidden
    className="absolute inset-y-0 left-0 w-[4px]"
    style={{ background: getTeamStripe(match.homeTeam.slug, "vertical") }}
  />

// 変更後（右端のアウェイストリップを追加するだけ。それ以外は変えない）
<article className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
  <div
    aria-hidden
    className="absolute inset-y-0 left-0 w-[4px]"
    style={{ background: getTeamStripe(match.homeTeam.slug, "vertical") }}
  />
  <div
    aria-hidden
    className="absolute inset-y-0 right-0 w-[4px]"
    style={{ background: getTeamStripe(match.awayTeam.slug, "vertical") }}
  />
```

`match.awayTeam.slug` は既存コードで使用済みのためインポート変更不要。

---

## Task 2 — `components/match-header.tsx`：上ボーダーをホーム|アウェイ2色に変更

### 問題

`getTeamStripe(..., "horizontal")` を使うとトリコロール国旗（Ireland など）の白帯が
ボーダーの中央で断裂して見える。

### 変更方針

上ボーダーをトリコロール縞ではなく「左半分=ホーム単色 / 右半分=アウェイ単色」の
シャープな2色バーに変更する。`getTeamColor` を両チームに適用し、50% で切り替える。

```tsx
// 変更前
export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);
  const outcome = getMatchOutcome(match);
  const homeColor = getTeamColor(match.homeTeam.slug);

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[4px]"
        style={{ background: getTeamStripe(match.homeTeam.slug, "horizontal") }}
      />

// 変更後
export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);
  const outcome = getMatchOutcome(match);
  const homeColor = getTeamColor(match.homeTeam.slug);
  const awayColor = getTeamColor(match.awayTeam.slug);

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[4px]"
        style={{
          background: `linear-gradient(to right, ${homeColor} 50%, ${awayColor} 50%)`,
        }}
      />
```

`getTeamStripe` のインポートは不要になるため削除する。
`getTeamColor` は既存のグラデーション背景（`${homeColor}18`）でも使用しているので残す。

---

## 完了条件

- [ ] 試合カード左端にホームチーム縞、右端にアウェイチーム縞が表示される
- [ ] 試合詳細スコアカードの上端が「左=ホーム単色 / 右=アウェイ単色」の2色バーになる
- [ ] 上バーに白い断裂が見えない（シャープな50%切り替え）
- [ ] `getTeamStripe` のインポートが `match-header.tsx` から削除されている
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `lib/format/team-identity.ts`（関数・データの変更なし）
- `match-events-section.tsx`
- カードおよびヘッダーのレイアウト構造
- ホームチームカラーの半透明グラデーション背景（`${homeColor}18`）
