`/specs/fix-nations-championship-schedule-ingestion-crash.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 本番で6日以上(2026-07-08〜)継続中の障害。`nations-championship-2026` の Round 2(日本 vs アイルランド含む6試合)が一度も取り込まれず、cron自体は6時間おきに"success"扱いで動き続けている中でこの大会だけがサイレントに全滅している
- 原因ファイル: `lib/ingestion/sources/world-rugby-nations-championship-times.ts` の `resolveTeamSlug()`(74-82行目)と `parseWorldRugbyNationsChampionshipSchedulePayload()`(128-157行目)。World Rugby API のレスポンスにクロスカンファレンス順位待ちのプレースホルダー行(`"NTH 6th"` vs `"STH 6th"` 等、`TEAM_SLUG_BY_WORLD_RUGBY_NAME` に存在しないチーム名)が混ざるようになり、`.map()` 内の1件の例外で配列全体の変換が失敗している
- 既存テストは `tests/ingestion/live-sources.test.ts`(`parseWorldRugbyNationsChampionshipSchedulePayload` を653行目付近で使用)。ここに新規テストケースを追加する
- 類似のWorld Rugbyペイロードのテストパターンは `tests/scrapers/world-rugby-schedule.test.ts` を参考にしてよい(別大会・別ソースだが構造は近い)

入出力の例:
- 入力: `payload.matches` に36件の正常な試合(チーム名が `TEAM_SLUG_BY_WORLD_RUGBY_NAME` に存在)+ 6件のプレースホルダー行(例: `{ teams: [{ name: "NTH 6th" }, { name: "STH 6th" }], ... }`)が混在する World Rugby API レスポンス
- 期待する出力: `parseWorldRugbyNationsChampionshipSchedulePayload()` が例外を投げずに36件の `WorldRugbyNationsChampionshipTime[]` を返す(プレースホルダー6件は結果に含まれない)
- 参考: 実際のプレースホルダー行のチーム名パターンは `"NTH 6th"`, `"STH 6th"`, `"NTH 3rd"`, `"STH 3rd"`, `"NTH 5th"`, `"STH 5th"`, `"NTH 2nd"`, `"STH 2nd"`, `"NTH 4th"`, `"STH 4th"`, `"NTH 1st"`, `"STH 1st"` の組み合わせ(6ペア)。他の表記揺れが今後出てくる可能性があるため、ハードコードでの除外リストではなく「マップに存在しないチーム名は全て読み飛ばす」という汎用ロジックにすること

処理すべきエッジケース:
- 正常行が0件・プレースホルダーのみのレスポンスでも例外を投げず空配列を返す
- `parseTeams` 以外の `throw` 箇所(`parseKickoffAt`, `getMatchId` 等)も同じ設計上の弱点を持つ。spec の「実装方針」4番を踏まえ、Codex の判断で一貫した方針(該当行だけスキップ)に倒してよい。ただし挙動を変える場合はテストで担保すること
- `fetchNationsChampionship2026()`(`lib/ingestion/sources/wikipedia-nations-championship.ts`)側は変更不要(`Promise.all` の片方が正常に解決すれば全体も解決するようになるはず)。ここを変更する場合は理由を完了報告に明記すること

完了の定義:
- specs の受け入れ条件 1〜5(テスト・型・lint)を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` clean
- 受け入れ条件6(本番での再取り込み確認)は Codex の実装スコープ外。Owner が承認後に手動実行するため、実装対象としない

要件:
- 「スコープ対象外」(アラート機構、クロスオーバー順位の解決、Wikipediaパーサ変更、順位表対応)は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
