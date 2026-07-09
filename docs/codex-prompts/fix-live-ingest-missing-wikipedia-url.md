`/specs/fix-live-ingest-missing-wikipedia-url.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 根本原因: `ParsedWikipediaMatch`型（`lib/ingestion/sources/wikipedia-six-nations.ts:24`）に `wikipediaUrl` フィールドが存在せず、`lib/ingestion/live-ingest.ts` の `toExternalIds`（127-148行目）が `wikipedia_url` を一切 `external_ids` に書き込んでいない
- 対象は `LIVE_COMPETITION_SOURCES`（`lib/ingestion/live-competitions.ts`）に登録されている11ソース。各ソースファイルは既に内部で `buildWikipediaUrl` 相当の関数でURLを構築しているので、そのURLを返り値のオブジェクトに含めるだけでよい
- 本番DB実測で337試合（league-one 114+108件、super-rugby-pacific 2026進行中シーズン81件、premiership 15件、urc 12件、top-14 5件、pnc 2件）が影響を受けている
- 既存337件へのバックフィルは不要。`lib/ingestion/upsert.ts:62-63` の `buildMatchUpdate` が `external_ids` を既存値とスプレッドマージする実装のため、修正後に既存の定期cron（`ingest-live-competitions`）が通常運用で対象試合を再訪すれば自動的に埋まる

入出力の例:
- `wikipedia-urc.ts` の `parseUrcLiveHtml` が返す各試合オブジェクトに `wikipediaUrl: "https://en.wikipedia.org/wiki/2025–26_United_Rugby_Championship"` が含まれる
- `toExternalIds(source, match)` の返り値に `wikipedia_url` キーが含まれる（`match.wikipediaUrl` が存在する場合）

処理すべきエッジケース:
- `parseUrcLiveHtml(html: string)` のように、現在URLを引数に取らない関数はシグネチャ変更が必要（`fetchUrc202526` から呼び出し元でURLを渡す）。各ソースファイルの現在の実装を個別に確認してから最小限の変更を行う
- `wikipedia-nations-championship-events.ts` が `wikipedia-nations-championship.ts` と同じURLを使う場合、重複コードを避けるため共通化してよい（判断はCodexの裁量）
- 11ソースのうち一部（six-nations経由の大会等）は既に別経路でURLが正しく設定されている。今回の対象はあくまで`LIVE_COMPETITION_SOURCES`経由のソースのみで、それ以外には触れない

完了の定義:
- specs の受け入れ条件 1〜4・6 をすべて満たす（受け入れ条件5の本番cron実行はOwnerが別途行うため、実装・テストまでで完了とする）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 11ソースファイルそれぞれについて、`wikipediaUrl` が正しく返り値に含まれることを検証するユニットテストを追加する（既存の `tests/ingestion/live-sources.test.ts` 等の構成に倣う）

要件:
- スコープ対象外（既存337件への個別バックフィルスクリプト、URC専用パーサの拡張、six-nations等の別経路調査）は実装しない
- 未解決の質問（nations-championship-eventsの共通化方針）は迷う場合は完了報告で選択肢を提示してよい。推測せず判断根拠を明記する
- 本番DBへの書き込み・cron実行は行わない

完了時:
- 実装内容、変更した11ソースファイルの一覧を要約する
- シグネチャ変更が必要だった箇所とその対応方法を明記する
- 仕様書からの逸脱があれば理由を明示する
