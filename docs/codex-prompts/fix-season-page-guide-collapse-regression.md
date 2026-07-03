バグ: シーズンページの大会ガイドが `<details>` で折りたたまれており、初期状態で閉じている。

再現手順:
1. `/c/premiership/2025-26`（または任意のシーズンページ）を開く
2. ページ最下部の「大会ガイドを見る」をクリックしないと大会ガイド本文が見えない

期待動作: 大会ガイドは常時展開表示（クリックせず全文が見える）。ページ内の位置（最下部）はそのままでよい

実際の動作: `<details>`/`<summary>` で折りたたまれ、初期状態で閉じている

調査済み:
- 2026-06-25 のコミット `bd3fba1`（`fix: 大会ガイドを常時展開表示に変更（collapsible廃止）`）で、過去に全く同じ「大会ガイドを `<details>` で折りたたむ」実装が一度採用された後、「折りたたみ状態だと見つけにくいため」という理由で明示的に元に戻されていた
- この過去の判断は `docs/decisions.md` には記録されておらず、`components/competition-viewing-guide.tsx` から `collapsible` prop が削除済みだった（＝コンポーネント側に痕跡が残っていなかった）ため、直近の `specs/feat-season-page-ia.md`（PR #454, `35906b8`）を書いた際に見落とし、同じパターンを再導入してしまった

原因と思われる場所: `app/c/[competition]/[season]/page.tsx` の末尾、`CompetitionViewingGuide` を `<details>`/`<summary>` でラップしている箇所（PR #454 で追加）

対応方針: `/specs/fix-season-page-guide-collapse-regression.md` を読んで実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `app/c/[competition]/[season]/page.tsx` のみ
- `feat-season-page-ia.md` で行った他の変更（`StandingsTable` を上部に移動、`components/standings-table.tsx` のフルネーム表示）は維持すること。撤回するのは「折りたたみ」だけで、「並び替え」は撤回しない
- `components/competition-viewing-guide.tsx` は変更不要（既に `collapsible` prop を持たない）

処理すべきエッジケース:
- `<details>`/`<summary>` を外す際、周囲の `className`（`rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6` 等）のスタイリング自体は維持し、単に常時表示の `<div>` に置き換えること
- `tests/app/season-page-ia.test.tsx` に `<details>` の開閉状態を検証しているアサーション（`details.closest("details")` や `not.toHaveAttribute("open")` 等）があれば、常時展開を検証するアサーションに更新すること

成果物: 修正 + 既存テストの更新（リグレッションテストとして、大会ガイドが常時展開表示であることを検証するアサーションを残すこと）

完了時:
- 実装内容、変更ファイルを要約する
- `pnpm tsc --noEmit` / `pnpm build` の結果を報告する
- Owner への未解決の質問があれば記載する（例: `docs/decisions.md` への追記要否）
