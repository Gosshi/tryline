# 大会カラーアクセント：大会ハブにブランドカラーバーを追加

## 背景

大会ハブページ（`/c/[competition]/[season]`）が "Premiership 2025-26" というテキストだけで始まり、
大会固有のビジュアルアイデンティティがない。
競合スポーツメディアはリーグカラーをヘッダーに使うのが標準的で、
Tryline もこれに倣うことで「どの大会を見ているか」の没入感を高める。

## スコープ

- 対象: `lib/format/competition.ts`（カラー定義追加）、`app/c/[competition]/[season]/page.tsx`（ヘッダーに適用）
- 対象外: `/c/[competition]`（ファミリー一覧ページ）、試合カード

## 変更内容

### 1. `lib/format/competition.ts` にカラーマップを追加

```ts
export const COMPETITION_FAMILY_COLORS: Record<string, string> = {
  "six-nations":         "#001489",
  "premiership":         "#1C2C6B",
  "urc":                 "#00823E",
  "top-14":              "#D62B31",
  "super-rugby-pacific": "#0057B8",
  "rugby-championship":  "#C8102E",
  "autumn-nations":      "#2D2D2D",
  "league-one":          "#FF6B00",
  "pnc":                 "#00539B",
};

export function getCompetitionFamilyColor(family: string): string {
  return COMPETITION_FAMILY_COLORS[family] ?? "#1e293b";
}
```

`family` は competition slug から年号を除去した値（例: `"premiership-2025-26"` → `"premiership"`）。
既存の `formatFamilyName` と同様のパターンで slug を正規化して参照する。

### 2. `app/c/[competition]/[season]/page.tsx` のページヘッダーに適用

大会名・シーズン名の表示エリアに、左端の太いカラーバーを追加する（左ボーダー方式）:

```tsx
const family = competition.slug.replace(/-\d{4}(-\d{2})?$/, "");
const accentColor = getCompetitionFamilyColor(family);

<div
  className="rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200"
  style={{ borderLeft: `4px solid ${accentColor}` }}
>
  <p style={{ color: accentColor }} className="text-xs font-semibold uppercase tracking-[0.18em]">
    {formatFamilyName(family)}
  </p>
  <h1 className="mt-1 font-serif text-3xl font-bold text-[var(--color-ink)]">
    {formatCompetitionTitle(competition.name, competition.season)}
  </h1>
</div>
```

既存のレイアウト構造に合わせて Codex が実装方法を調整してよい（左ボーダー or 上ボーダー）。

## 変更ファイル

- `lib/format/competition.ts`
- `app/c/[competition]/[season]/page.tsx`

## 受け入れ条件

- 大会ハブページで大会名の左（または上）にそのリーグカラーのアクセントバーが表示される
- Six Nations / Premiership / URC / Top 14 / Super Rugby Pacific / Rugby Championship の各ページで異なる色が表示される
- 未定義の大会はフォールバックカラー `#1e293b` を使用
- 試合カードや他のページへの影響なし
