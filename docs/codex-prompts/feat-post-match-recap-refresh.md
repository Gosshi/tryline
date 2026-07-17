# Codex プロンプト: feat-post-match-recap-refresh

`specs/feat-post-match-recap-refresh.md` の受け入れ条件に従って実装してください。`feat-thursday-weekend-preview-refresh.md`（同時に別PRとして進行中）と同一パターンなので、そちらの実装/PRがあれば構成を揃えてください。

## やること

新規 GitHub Actions workflow `.github/workflows/cron-post-match-recap-refresh.yml` を追加してください。既存の `.github/workflows/cron-ingest-league-one-lineups.yml` を参考パターンにしてください。

## 仕様の要点

- schedule トリガー: 毎週月曜 09:05 JST（00:05 UTC。既存`cron-live-pipeline.yml`の09:00 JST枠と重ならないよう数分ずらす、例: `5 0 * * 1`）
- `workflow_dispatch`の場合は、`from`/`to`（`YYYY-MM-DD`形式）を入力パラメータとして受け取れるようにする（手動実行・動作確認用）。schedule実行時は`from=4日前`, `to=今日`をjobステップ内で計算する
- 処理フロー:
  1. `GET https://www.trylinerugby.com/api/v1/calendar?from=<from>&to=<to>` で対象期間の試合一覧を取得（認証不要の公開エンドポイント）
  2. レスポンスから `status: "finished"` の試合の `match_id` を抽出
  3. 各試合について順に:
     - `POST /api/cron/fetch-sourced-facts?match_id=<id>&content_type=recap&force=true`（`Authorization: Bearer ${{ secrets.CRON_SECRET }}`）
     - このステップが非200なら、この試合の`generate-content`は呼ばずWARNログを出して次の試合へ進む
     - 成功した場合のみ: `POST /api/cron/generate-content`（同認証、body: `{"contentType":"recap","matchIds":["<id>"],"language":"ja"}`）
  4. 最後に対象試合数・成功数・失敗数のサマリをログに出す

## 参考にすべき既存パターン

- `.github/workflows/cron-ingest-league-one-lineups.yml`（`workflow_dispatch`の入力設計、`content_type=recap`を既に扱っている`regen()`関数のパターン）
- `feat-thursday-weekend-preview-refresh.md`向けの実装(並行して進めている場合、workflow構成のスタイルを揃える)
- `/api/cron/fetch-sourced-facts`・`/api/cron/generate-content`の既存実装

## エッジケース

- 対象期間に`finished`の試合が1件も無い場合、エラーにせず「対象0件」のログを出して正常終了する
- `/api/v1/calendar`が非200を返した場合、workflow全体を失敗させる
- `fetch-sourced-facts`が失敗した試合は`generate-content`を呼ばない（specの受け入れ条件5番、プレビュー側のspecには無い recap 固有のルールなので注意）

## 完了の定義

- spec の受け入れ条件8項目を全て満たす
- workflow の構文が正しいこと
- 曖昧な点や仕様書と実環境の食い違いがあれば、実装前にその場で報告してください
