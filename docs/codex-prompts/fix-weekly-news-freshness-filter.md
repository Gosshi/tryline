# Codex プロンプト: fix-weekly-news-freshness-filter

**tryline リポジトリ**で貼る(仕様書: `specs/fix-weekly-news-freshness-filter.md`)。`feat-weekly-news-stories-api.md`(PR #645、マージ・デプロイ済み)の直後のフォローアップ。

---

`specs/fix-weekly-news-freshness-filter.md` の仕様を実装してください。本番での試し焼きで、対象週より3週間以上古いニュースが取得されてしまう問題が見つかりました。プロンプトとコード側フィルタの両方で、対象週内に公開されたニュースのみを採用するよう修正してください。

コンテキスト:
- 対象ファイル: `lib/llm/weekly-news/fetch.ts`(`buildWeeklyNewsSearchPrompt`・`parseWeeklyNewsResponse`)
- 参考テスト: `tests/llm/weekly-news.test.ts`
- `AGENTS.md`を読む

やること:
1. `buildWeeklyNewsSearchPrompt`のSearch intentセクションに、「対象週(`weekFrom`〜`weekTo`、JST)に公開されたニュースのみを対象とする。それより古いニュースは関連性があっても対象外とする」という趣旨の英語指示を追加する
2. `parseWeeklyNewsResponse`に鮮度フィルタを追加する:
   - `published_at`が`weekFrom`(JST 00:00)より前の項目を除外する
   - `published_at`が`null`または不正な日時形式の項目も除外する(既存の`normalizePublishedAt`が`null`を返した場合、そのアイテム自体を破棄する)
3. `weekFrom`をJST 00:00のUTC時刻に変換する処理が必要な場合は、既存の`lib/format/week.ts`のユーティリティ(`getJstWeekRangeUtc`等の`startUtcIso`)を再利用する。新規の日時変換ロジックを重複実装しない

エッジケース:
- `weekTo`より未来の`published_at`は今回は特別扱いしない(そのまま許容)
- `parseWeeklyNewsResponse`は`weekFrom`を受け取る必要があるため、関数シグネチャの変更が必要(呼び出し元の`fetchWeeklyNews`も合わせて更新する)

やらないこと:
- 検索呼び出し回数・許可ドメインリストの変更
- `GET /api/v1/stories/weekly-news`のレスポンス形状の変更
- モバイル側(`tryline-mobile`)の変更

完了の定義:
- specs の受け入れ条件 1〜6 を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
