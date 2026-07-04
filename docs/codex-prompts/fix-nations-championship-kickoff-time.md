`/specs/fix-nations-championship-kickoff-time.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象の既存パーサは `lib/ingestion/sources/wikipedia-nations-championship.ts`。時刻を持たない Wikipedia ソースが唯一の参照元になっているため kickoff_at が全試合 `00:00:00+00`（日付のみ）になっている
- `lib/ingestion/sources/live-source-utils.ts` の `buildUtcIsoString({ dateText, timeText, offsetHours })` は既に時刻対応済み。使う側が `timeText` を渡していないだけ
- 他ソースの実装パターンは `lib/ingestion/sources/wikipedia-urc.ts` 等を参考にする
- fetch は必ず既存の `lib/scrapers/fetcher.ts` の `fetchWithPolicy`（robots.txt・レート制限を継承）を使うこと。新しいドメインへの fetch を追加する前に、対象URLの robots.txt が許可しているか確認すること

入出力の例:
- 対象試合: 2026-07-04 日本 vs イタリア（`match_id = f56e9ee9-14be-49e3-b47d-c51a29c07593`）
- 変更前: `matches.kickoff_at = 2026-07-04 00:00:00+00`
- 変更後: `matches.kickoff_at = 2026-07-04T08:40:00Z`（現地キックオフ 17:40 JST 相当。JRFU発表・World Rugby記載の実際の時刻）
- spec記載の World Rugby 候補URL（`https://www.world.rugby/nations-cup/en/matches/2026` 等）に実際に fetch し、実際のHTML構造を確認してから実装すること。想定と異なる場合はコード側で吸収するか、spec の「未解決の質問」に沿って Owner に代替ソースを相談すること

処理すべきエッジケース:
- 37試合全てのラウンド（Southern Series 3節・Northern Series 3節・Finals Weekend）でチーム名・日付の対応付けが正しく行われること（同日に複数試合があるため、チーム名でのマッチングが必須）
- World Rugby 側の時刻表記（am/pm、現地タイムゾーン）を正しく UTC に変換すること。会場ごとにタイムゾーンが異なる（南半球開催と北半球開催が混在）ため、venue や国からタイムゾーンを判定するロジックが必要になる可能性がある
- 既存37試合の kickoff_at をバックフィルするスクリプトを用意すること（他の `scripts/*backfill*` の慣例に合わせる）。実行は Owner 承認後のため、スクリプトの提供のみでよく本番に対して自動実行しないこと

完了の定義:
- specs の受け入れ条件6項目すべてを満たす
- `pnpm test` が通る
- `pnpm tsc --noEmit` でエラーなし
- 新規パーサ/マージ層に対する単体テストを追加する

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 本番バックフィルスクリプトの実行方法（コマンド）を明記する。実行はしない
- Owner への未解決の質問があれば記載する
