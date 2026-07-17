# Codex プロンプト: feat-thursday-weekend-preview-refresh

`specs/feat-thursday-weekend-preview-refresh.md` の受け入れ条件に従って実装してください。

## やること

新規 GitHub Actions workflow `.github/workflows/cron-weekend-preview-refresh.yml` を追加してください。既存の `.github/workflows/cron-ingest-league-one-lineups.yml` を参考パターンにしてください（`workflow_dispatch`対応・非200時のWARNログ・処理継続のスタイルを踏襲）。

## 仕様の要点

- schedule トリガーを2つ持つ:
  - 木曜21:00 JST（12:00 UTC。既存`cron-live-pipeline.yml`の21:00 JST枠と重ならないよう数分ずらす、例: `5 12 * * 4`）→ 対象は直近の金曜・土曜キックオフ試合
  - 金曜21:00 JST（`5 12 * * 5`）→ 対象は直近の日曜キックオフ試合
- `github.event.schedule`（cron文字列）でどちらのトリガーかを判定し、対象期間（`from`/`to`、`YYYY-MM-DD`形式）をjobステップ内で計算する
- `workflow_dispatch`の場合は、`from`/`to`を入力パラメータとして受け取れるようにする（手動実行・動作確認用）
- 処理フロー:
  1. `GET https://www.trylinerugby.com/api/v1/calendar?from=<from>&to=<to>` で対象期間の試合一覧を取得（認証不要の公開エンドポイント）
  2. レスポンスから `status: "scheduled"` の試合の `match_id` を抽出
  3. 各試合について順に:
     - `POST /api/cron/fetch-sourced-facts?match_id=<id>&content_type=preview&force=true`（`Authorization: Bearer ${{ secrets.CRON_SECRET }}`）
     - `POST /api/cron/generate-content`（同認証、body: `{"contentType":"preview","matchIds":["<id>"],"language":"ja"}`）
     - 各ステップの応答コードをログに出す。非200ならWARNログを出して次の試合へ進む（`cron-ingest-league-one-lineups.yml`の`ingest`/`regen`ステップと同じパターン）
  4. 最後に対象試合数・成功数・失敗数のサマリをログに出す

## 参考にすべき既存パターン

- `.github/workflows/cron-ingest-league-one-lineups.yml`（`workflow_dispatch`の入力設計、非200時のWARN継続パターン、`curl -s -o /tmp/resp.json -w "%{http_code}"`のレスポンス取得方法）
- `/api/v1/calendar`のレスポンス形式は `src/api/types.ts`（tryline-mobile）の`V1CalendarData`型、または tryline 本体の `app/api/v1/calendar/route.ts` を参照
- `/api/cron/fetch-sourced-facts`・`/api/cron/generate-content`の既存実装（`app/api/cron/fetch-sourced-facts/route.ts`・呼び出し例は`cron-ingest-league-one-lineups.yml`の`regen()`関数）

## エッジケース

- 対象期間に試合が1件も無い場合、エラーにせず「対象0件」のログを出して正常終了する
- `/api/v1/calendar`が非200を返した場合、workflow全体を失敗させる（試合一覧が取れなければ後続処理が無意味なため）
- 同じ試合に対して`fetch-sourced-facts`が失敗した場合、`generate-content`は呼ばない（古い事実のまま再生成しても意味がないため）

## 完了の定義

- spec の受け入れ条件8項目を全て満たす
- workflow の構文が正しいこと（`gh workflow list`やYAML構文チェックで確認）
- 曖昧な点や仕様書と実環境の食い違いがあれば、実装前にその場で報告してください
