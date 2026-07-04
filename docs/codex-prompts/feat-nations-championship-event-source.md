`/specs/feat-nations-championship-event-source.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 参考実装（クローン元）: `lib/ingestion/sources/wikipedia-pnc.ts`（`.vevent.summary`ブロック収集→`parseWikipediaSixNationsHtml`で共通パース、というパターン）
- イベント永続化: `lib/ingestion/events.ts` の `upsertMatchEvents`（delete→insertで冪等）
- finished遷移時のイベント生成トリガー: `lib/ingestion/live-ingest.ts` 272行目付近 `statusChangedToFinished`
- 再パースバックフィルの参考実装: `specs/feat-backfill-reparse-existing-urc-events.md`（`scripts/backfill-urc-match-events.ts` の `--reparse-existing` フラグ、対象選定ロジック）
- 対象記事URL: Southern=`https://en.wikipedia.org/wiki/2026_Nations_Championship_Southern_Hemisphere_Series`、Northern=`https://en.wikipedia.org/wiki/2026_Nations_Championship_Northern_Hemisphere_Series`
- **重要**: `lib/ingestion/sources/wikipedia-nations-championship.ts`（メインページ、スコア/ステータス取り込み）は変更しないこと。本日マージ済みのキックオフ時刻修正（PR #463）がこれに依存している

入出力の例:
- 実データ確認済み: Southern Hemisphere Series記事の日本vsイタリア戦で「Dearns 10' c」「Matsunaga 16' c」（トライ、分数付き）のようなスコアラー情報が実在することをWeb調査で確認済み
- 変更後: このデータから `match_events` に選手名・分数・イベント種別（try等）が正しく抽出・upsertされること

処理すべきエッジケース:
- Southern/Northern両記事のセクション見出し構造（`Round_1`〜`Round_6`）がPNCの`Pool_A`/`Pool_B`と同じ`.vevent.summary`形式か、実装時に実ページを取得して確認すること。異なる場合は構造に応じて実装を調整すること
- 同一大会slug（`nations-championship-2026`）に対し、既存のメインページソース（スコア）と新しいサブ記事ソース（イベント）が並存する設計が `live-competitions.ts`/`live-ingest.ts` の既存アーキテクチャと整合するか確認し、整合しない場合はspecの「未解決の質問」に沿って報告すること
- 既にfinished済みの試合（Round1、日本vsイタリア含む3試合以上）はライブ経路の`statusChangedToFinished`トリガーの対象外なので、`--reparse-existing`相当のバックフィルスクリプトで別途対応すること
- 冪等性: 再実行しても`match_events`が二重計上にならないこと

完了の定義:
- specの受け入れ条件6項目すべてを満たす
- `pnpm test`・`pnpm tsc --noEmit` 通過
- 実際の本番バックフィル実行はしない（Owner承認後に別途実行する）

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（メインページパーサーの変更・統合、Finals Weekend、ラインアップ取り込み）は実装しない
- 曖昧な箇所（specの「未解決の質問」2点）は実装時に調査し、結果を報告すること。推測で進めない

完了時:
- 実装内容、変更ファイルを要約する
- Southern/Northern記事の実際のHTML構造調査結果を報告する
- 既存アーキテクチャとの整合性について調査結果を報告する
- バックフィルスクリプトの実行コマンド（dry-run・本実行）を明記する。実行はしない
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
