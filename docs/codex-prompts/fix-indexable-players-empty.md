# Codex プロンプト: listIndexablePlayerSlugs が空を返すバグ修正

`specs/fix-index-bloat-players-teams.md` の実装後、本番検証で**選手ページが sitemap から全件消える**バグが見つかりました。修正してください。

## 症状（本番で確認済み 2026-06-02）
- `https://www.trylinerugby.com/sitemap.xml` の `/players/` エントリが **0件**（選手 約1,000件が丸ごと消失。sitemap 総URL 2,675 → 1,675）。
- 一方、**実名・出場ありの選手ページは個別には indexable**（例: `/players/siya-kolisi` は `<meta name="robots">` 無し ＝ index 対象）。
- つまり **per-page 判定（`hasPublishedContentLineup`）は正しく動くが、sitemap 用の一括クエリ `listIndexablePlayerSlugs()` が本番で `[]` を返している。** 2つのコードパスが矛盾している。

## 原因の切り分け（調査済み）
- FK 埋め込み名 `players!match_lineups_player_id_fkey` は**正しい**（`lib/db/types.ts` L483、`lib/db/queries/match-lineups.ts` で公開ページが同名で動作）。
- 例外は投げていない（sitemap は新コードで正常生成され、`/teams/`・player-hash 除外は効いている）。つまり `listIndexablePlayerSlugs` は**正常に空配列を返している** ＝ `canonicalIds` が最後まで空。
- 差分は **`.eq("match_id", 単一)` の埋め込み（動く）** vs **`.in("match_id", 200件)` の埋め込み（空）**。大量行 × 埋め込みリレーションの組み合わせ（PostgREST のデフォルト行上限や埋め込み解決の挙動）が疑わしい。

## 修正方針（推奨: 実証済みパターンに揃える）
`listIndexablePlayerSlugs()`（`lib/db/queries/players.ts` L312 付近）を、**埋め込みリレーションを使わず**、本番で動いている per-page パターン（`hasPublishedContentLineup` / 非埋め込みの `match_lineups` 直引き）に揃えて書き直す:

1. `listMatchIdsWithContent()` でコンテンツあり試合 ID を取得（既存）。
2. `match_lineups` を **`select("player_id")`（埋め込みなし）** で、対象 match_id に絞って引き、**出場している player_id の集合**を作る。
   - **PostgREST のデフォルト行上限（~1,000行）に注意。** 200試合×~46人＝~9,000行は1回のクエリで取り切れない。`.range()` でのページング、または match_id チャンクをさらに小さくする等で**全行を確実に取得**すること（ここが現行バグの最有力原因の可能性）。
3. 集めた player_id を `players` テーブルで解決し、`canonical_player_id` を辿って**canonical 選手に正規化**（alias は canonical へ集約）。
4. `isIndexablePlayer`（既存ヘルパー、`canonical_player_id IS NULL` ＋ 実名スラッグ判定）で絞り、slug を返す。
5. 既存の `isIndexablePlayer` の判定基準（実名＋出場あり）は変えない。

## 参考にする既存パターン
- `lib/db/queries/players.ts` の `hasPublishedContentLineup`（per-page・**非埋め込み**で `match_lineups` を `player_id`/`match_id` で引く。本番で動作）。
- `lib/db/queries/match-lineups.ts` `getMatchLineupsForMatch`（埋め込みは単一 match では動く＝大量 `.in` との差を意識）。
- `chunkArray`（既存）。ページングする場合は `.range(from, to)` を用いる。

## 必ず処理すべきエッジケース
1. 出場行が PostgREST 行上限を超えても**全 player_id を取りこぼさない**（現行バグの核心。修正後に「siya-kolisi など実名・出場ありが sitemap に載る」ことで検証）。
2. alias 選手（`canonical_player_id` 非 null）は canonical に集約し、重複スラッグを出さない。
3. 無名 `player-<hash>` は引き続き除外。
4. コンテンツあり試合が0件 → `[]`（既存挙動維持）。
5. `getPlayerBySlug` 側の per-page 判定（`hasPublishedContentLineup`）と**結果が一致**すること（同じ選手について page が indexable なら sitemap にも載る、その逆も）。可能なら両者が同一の下層関数を共有して二重メンテを避ける。

## テスト
- `tests/db-queries-players-indexable.test.ts` を更新/追加し、**「コンテンツあり試合に出場した実名選手が結果に含まれる（空でない）」**ことを明示的に assert（現行テストはモックで通っているが本番の空返却を捉えられていない。行上限・ページングを模したケースを足す）。
- per-page 判定と一括判定が同一選手で一致することのテスト。

## 完了の定義
- `listIndexablePlayerSlugs()` が実名・出場あり選手を返す（空でない）。
- `pnpm typecheck` / `pnpm build` / `pnpm test`（全件）グリーン。
- 変更ファイル・原因の確定（行上限か埋め込みか）・残課題を末尾に要約。

## 完了時に報告してほしいこと
- 確定した根本原因（PostgREST 行上限 / 埋め込み解決 / その他）。
- 修正後にローカル or ステージングで得た indexable 選手件数の見込み。
- デプロイ後に Owner が本番で確認する手順（`sitemap.xml` の `/players/` 件数 > 0、`siya-kolisi` が含まれる）。
