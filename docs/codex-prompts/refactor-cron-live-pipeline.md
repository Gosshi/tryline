# Codex プロンプト — ライブ取り込み→生成 cron パイプライン再設計

仕様: `specs/refactor-cron-live-pipeline.md` を読んでから着手すること。以下は要点と注意のみ。仕様本文を繰り返さない。

## やること

GitHub Actions ワークフロー（`.github/workflows/`）のみを編集する。**アプリケーションコードは一切変更しない。**

1. 新規 `.github/workflows/cron-live-pipeline.yml` を作成。
   - `schedule: "0 0,6,12,18 * * *"` ＋ `workflow_dispatch`。
   - 単一ジョブ・3ステップを**この順序**で連続実行（仕様の YAML をそのまま使う）:
     1. `ingest-live-competitions`
     2. `fill-league-one-playoff-events`（`if: ${{ always() }}`）
     3. `orchestrate`（`if: ${{ always() }}`）
   - 各ステップ `curl -f -X POST -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://tryline-six.vercel.app/api/cron/<name>`。
2. `.github/workflows/cron-ingest-live-competitions.yml` を削除。
3. `.github/workflows/cron-orchestrate.yml` を削除。
4. `.github/workflows/cron-fill-league-one-playoff-events.yml` の `schedule` ブロックを削除し、`workflow_dispatch:` のみ残す（ファイル自体は残す）。

## 触ってはいけないもの（重要）

- 据え置き cron 6本: `cron-cleanup-raw-data`, `cron-ingest-fixtures`, `cron-ingest-results`, `cron-ingest-squads`, `cron-fill-event-gaps`, `cron-post-to-x`。差分ゼロ。
- `app/api/cron/**`, `lib/cron/**`, `lib/ingestion/**` を含む全アプリコード。差分ゼロ。

## 設計意図（壊さないために理解しておくこと）

- recap は試合単位で一度だけ生成・キャッシュされ再生成されない。よって**イベント補完（fill-league-one-playoff-events）は orchestrate より前に走る必要がある**。3ステップの順序がこの不変条件。順序を変えたり fill ステップを省くと、League One プレーオフ recap がイベント欠落で恒久固定される回帰になる。
- `curl -f` で各ステップが HTTP 完了まで待つ＝ingest 完了後に orchestrate が走り、newly-finished 試合をその場で拾える。
- `if: ${{ always() }}` は前段が失敗してもバックログ/preview 生成を止めないため。既存データに対して安全（未生成のみ生成）。

## エッジケース

- 既存ワークフロー名（`name:`）と新規 `cron-live-pipeline.yml` の `name:` が衝突しないこと（仕様では `Cron — Live Pipeline`）。
- `fill-league-one-playoff-events` はオフシーズン no-op だが 4 回/日呼ばれる。これは想定内（仕様コスト見積もり済み）。
- cron は UTC。`0 0,6,12,18 * * *` = 09/15/21/03 JST であることを確認。

## 完了の定義

- 仕様「受け入れ条件」1〜7 をすべて満たす。
- `actionlint`（あれば）で新規・編集ワークフローが pass。
- 変更ファイルは `.github/workflows/` 配下のみ（4ファイル: 新規1・削除2・編集1）。アプリコード差分なし。
- マージは Owner。マージ後に Owner が `workflow_dispatch` で手動実行し、3ステップ成功・orchestrate が JSON を返すことを確認する。

## 未確定（Owner 確認待ち、着手前に解消）

仕様「未解決の質問」1〜6。特に手動実行 runbook（質問1）の有無は Owner 指示に従う。
