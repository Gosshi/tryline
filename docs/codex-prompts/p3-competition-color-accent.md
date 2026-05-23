# Codex 指示書: 大会カラーアクセント

仕様書: `specs/p3-competition-color-accent.md`

## タスク概要

大会ハブページ（`/c/[competition]/[season]`）のヘッダーに、大会固有のカラーアクセントバーを追加する。migration 不要。

## 変更ファイル（2ファイルのみ）

### 1. `lib/format/competition.ts`

ファイル末尾に以下を追加:

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

`family` は competition slug から年号を除去した値。
例: `"premiership-2025-26"` → `"premiership"`。
既存の `formatFamilyName` と同様のパターンで slug を正規化して参照すること。

### 2. `app/c/[competition]/[season]/page.tsx`

- `getCompetitionFamilyColor` を `lib/format/competition.ts` から import
- competition slug から family を抽出:
  ```ts
  const family = competition.slug.replace(/-\d{4}(-\d{2})?$/, "");
  const accentColor = getCompetitionFamilyColor(family);
  ```
- 大会名ヘッダー要素に `style={{ borderLeft: '4px solid ${accentColor}' }}` を追加
- 大会名テキスト（`formatFamilyName` の出力）に `style={{ color: accentColor }}` を追加
- 既存のレイアウト構造に合わせて実装方法を調整してよい（左ボーダー or 上ボーダー）

## 完了条件

- [ ] Six Nations / Premiership / URC / Top 14 / Super Rugby Pacific / Rugby Championship の各ページで異なるカラーバーが表示される
- [ ] 未定義の大会はフォールバックカラー `#1e293b` を使用
- [ ] 試合カードや他ページへの影響なし
- [ ] `pnpm tsc --noEmit` が通る
- [ ] migration 不要