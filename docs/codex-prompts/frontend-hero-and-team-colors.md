# Codex Prompt: Hero セクション追加 & チームカラー表示

## 目的

UI 上の 2 つの優先度 High 課題を解決する。

1. **ホームページに Hero ブロックを追加** — 初回訪問者がサービスの価値をすぐ理解できない
2. **マッチカードにチームカラーの左ボーダーを追加** — どのチームの試合か視覚的に判断しにくい

---

## Task 1 — Hero セクション（`app/page.tsx`）

### 変更対象

`app/page.tsx`

### 変更内容

`<main>` 内、`<div className="mx-auto ...">` の最初の子として、既存の `<header>` の**上に** Hero ブロックを挿入する。

```tsx
<section className="border-b border-slate-200 bg-white py-12 sm:py-16">
  <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600">
      AI Rugby Analysis in Japanese
    </p>
    <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
      海外ラグビーを、日本語で深掘り。
    </h1>
    <p className="mt-4 max-w-xl text-base text-slate-600">
      Six Nations をはじめとする世界のラグビーリーグを、AI が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
    </p>
  </div>
</section>
```

挿入後、現在の `<header>` 内の `<h1>` を `<h2>` に変更する（見出し階層の修正）:

```tsx
<h2 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
  {formatCompetitionTitle(competition.name, competition.season)}
</h2>
```

`competition` が `null` の場合（データなし状態）の分岐には Hero を追加しなくてよい。

---

## Task 2 — チームカラー定義（`lib/format/team-identity.ts`）

### 変更対象

`lib/format/team-identity.ts`

### 変更内容

`TeamIdentity` 型に `color` フィールドを追加し、各チームの公式カラーを設定する。また `getTeamColor()` をエクスポートする。

```ts
type TeamIdentity = {
  flag: string;
  color: string;
};

const TEAM_IDENTITY: Record<string, TeamIdentity> = {
  england:  { flag: getSubdivisionFlag("gbeng"), color: "#CC0000" },
  france:   { flag: "🇫🇷",                       color: "#002395" },
  ireland:  { flag: "🇮🇪",                       color: "#009A44" },
  italy:    { flag: "🇮🇹",                       color: "#003DA5" },
  scotland: { flag: getSubdivisionFlag("gbsct"), color: "#003087" },
  wales:    { flag: getSubdivisionFlag("gbwls"), color: "#C8102E" },
};

export function getTeamFlag(slug: string): string {
  return TEAM_IDENTITY[slug]?.flag ?? "🏉";
}

export function getTeamColor(slug: string): string {
  return TEAM_IDENTITY[slug]?.color ?? "#94a3b8"; // slate-400
}
```

---

## Task 3 — マッチカードにカラーボーダー（`components/match-card.tsx`）

### 変更対象

`components/match-card.tsx`

### 変更内容

`getTeamColor` をインポートし、`<article>` にホームチームカラーの左ボーダーを追加する。

Tailwind の動的クラス（`border-l-[${color}]`）はビルド時にパージされるため、`style` prop で `borderLeftColor` を直接指定する。

インポートを追加:

```ts
import { getTeamColor, getTeamFlag } from "@/lib/format/team-identity";
```

`<article>` の `className` に `border-l-4` を追加し、`style` prop を追加する:

```tsx
<article
  className="h-full rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50 border-l-4"
  style={{ borderLeftColor: getTeamColor(match.homeTeam.slug) }}
>
```

---

## 完了条件

- [ ] `app/page.tsx`: Hero ブロックが `<header>` の上に描画される
- [ ] `app/page.tsx`: 競技名見出しが `<h2>` になっている（`<h1>` は Hero ブロックの見出しのみ）
- [ ] `lib/format/team-identity.ts`: `getTeamColor()` がエクスポートされている
- [ ] `components/match-card.tsx`: マッチカード左端に幅 4px のチームカラーボーダーが表示される
- [ ] TypeScript エラーなし（`pnpm tsc --noEmit` パス）
- [ ] `pnpm build` が成功する

## 変更しないこと

- `MatchCard` の既存のレイアウト・スコア表示ロジック
- `getTeamFlag()` の既存の実装
- ルーティング・データ取得ロジック
