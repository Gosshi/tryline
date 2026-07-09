`/specs/fix-lineup-ingestion-non-league-one.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 根本原因: `lib/scrapers/wikipedia-lineups.ts` の `parseSeasonPageLineupHtml`（182-215行目）が、内部で `parseWikipediaSixNationsHtml`（Six Nations専用パーサー）を使っているため、Six Nations以外の大会では常に `null` を返す。呼び出し元の `app/api/cron/ingest-lineups/route.ts`（73-79行目）はチーム名を正しく渡しており、そちら側の問題ではない
- 5大会（urc・top-14・premiership・super-rugby-pacific・nations-championship）にはそれぞれ既に正しく動作しているフィクスチャ専用パーサーが存在する: `lib/ingestion/sources/wikipedia-urc.ts`・`wikipedia-top-14.ts`・`wikipedia-premiership.ts`・`wikipedia-super-rugby-pacific.ts`・`wikipedia-nations-championship.ts`。これらが取得しているのと同じページにラインアップ情報が含まれているか、実装前に必ず実地調査すること（推測しない）
- `competitionFamily` は既に `lib/cron/orchestrate.ts:252` の `ingestLineups` 呼び出し時点で渡されているので、大会ごとの振り分けロジックに使える

入出力の例:
- 実地調査で「URC のフィクスチャページに各試合のスターティングメンバーが含まれている」と判明した場合、`wikipedia-urc.ts` を拡張してラインアップHTML/選手名リストも抽出できるようにする
- 実地調査で「Top14のマトリックス形式ページにはラインアップ情報が一切ない」と判明した場合、Top14は対象外とし、完了報告にその旨と確認方法（アクセスしたURL等）を明記する

処理すべきエッジケース:
- 大会によってラインアップの記載形式が大きく異なる可能性がある（スターティングXV+ベンチの表形式、背番号付きリスト等）ため、既存の `parseLineupFromTableHtml`（`wikipedia-lineups.ts:121`）が流用できるか、大会ごとに新しいパース関数が必要かを都度判断する
- 5大会分の差分が大きくなりすぎる場合は、大会ごとに分割してPRを出してよい（spec の「未解決の質問」参照）

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の一括バックフィルはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 実装した大会それぞれについて、固定HTMLフィクスチャを使ったユニットテストを追加する
- 既存のleague-one・Six Nationsの取り込みに関する既存テストが壊れていないことを確認する

要件:
- スコープ対象外（ラインアップ情報が存在しない大会への無理な実装、league-one自体の変更、Six Nations本体の変更、本番一括バックフィル）は実装しない
- 実地調査の結果（各大会でラインアップ情報の有無・URL・構造）を必ず完了報告に記載する。推測で「あるはず」として実装を進めない
- 未解決の質問（PR分割の要否、データソースが無い大会の代替案）について、迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、対応できた大会・対応できなかった大会の一覧を要約する
- 各大会の実地調査結果（アクセスしたURL、ラインアップ情報の有無）を報告する
- 仕様書からの逸脱があれば理由を明示する
