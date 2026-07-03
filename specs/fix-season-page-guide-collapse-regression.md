# シーズンページの大会ガイド折りたたみを撤回（リグレッション修正）

## 背景

`specs/feat-season-page-ia.md`（PR #454、本番マージ済み）は大会ガイド（`CompetitionViewingGuide`）を `<details>`/`<summary>` で折りたたみ、初期状態で閉じるようにした。

しかし 2026-06-25 のコミット `bd3fba1`（`fix: 大会ガイドを常時展開表示に変更（collapsible廃止）`）で、**全く同じ「大会ガイドを折りたたむ」パターンが一度採用された後、明示的に元に戻されていた**ことが判明した。コミットメッセージ:

> 折りたたみ状態だと見つけにくいため、`<details>`による開閉UIを廃止。CompetitionViewingGuideProps から collapsible prop を削除し、コンポーネントを常時展開のシンプルな `<section>` のみに整理。

この判断は `docs/decisions.md` に記録されておらず、`components/competition-viewing-guide.tsx` から `collapsible` prop 自体が削除済みだったため、`feat-season-page-ia.md` の spec 作成時点で見落とした。**本 spec はこの見落としを修正するリグレッション対応。**

## スコープ

**対象:** `app/c/[competition]/[season]/page.tsx` のみ

**対象外:**
- `feat-season-page-ia.md` の他の変更（`StandingsTable` を上部に移動したこと、`components/standings-table.tsx` のフルネーム表示）は維持する。過去のリグレッションが問題視したのは「ガイドを隠すこと」であり、「表示順序」ではないため、これらは撤回不要
- `components/competition-viewing-guide.tsx`（コンポーネント自体は既に `collapsible` prop を持たない状態。変更不要）

## 実装詳細

`app/c/[competition]/[season]/page.tsx` の末尾（現状、`<details>`/`<summary>` でラップされている箇所）を、`<details>` を外した常時展開の表示に戻す。

```tsx
// 変更前（PR #454 で導入。撤回対象）
<details className="group rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
  <summary className="cursor-pointer list-none font-heading text-lg font-bold text-[var(--color-ink)]">
    大会ガイドを見る
  </summary>
  <div className="mt-4">
    <CompetitionViewingGuide markdown={guide} />
  </div>
</details>

// 変更後（常時展開。位置はそのまま最下部でよい）
<div className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
  <CompetitionViewingGuide markdown={guide} />
</div>
```

**ページ内での位置（最下部、`StandingsTable` や `SeasonMatchGroups` より後ろ）は変更しない。** 2026-06-25 の過去コミットが問題視したのは「折りたたんで隠すこと」であり、「表示順序を下げること」ではないため、`feat-season-page-ia.md` で行った並び替え自体は維持してよい。

## 受け入れ条件

1. シーズンページの大会ガイドが `<details>` でラップされておらず、常時展開表示になっている
2. `CompetitionViewingGuide` は引き続きページ最下部（順位表・試合一覧より後）に表示される
3. `<details>`/`<summary>` の関連コードが削除されている
4. `pnpm tsc --noEmit` / `pnpm build` が通る
5. 既存の `tests/app/season-page-ia.test.tsx` のうち `<details>` の開閉状態を検証しているアサーションを、常時展開を検証するアサーションに更新する

## 未解決の質問

- この判断（折りたたみ禁止）を今後同じ見落としが起きないよう `docs/decisions.md` に追記するかは Owner 判断。追記を推奨する
