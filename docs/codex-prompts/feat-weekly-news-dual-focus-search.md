# Codex プロンプト: feat-weekly-news-dual-focus-search

**tryline リポジトリ**で貼る(仕様書: `specs/feat-weekly-news-dual-focus-search.md`)。`feat-weekly-news-stories-api.md`(PR #645)・`fix-weekly-news-freshness-filter.md`(PR #647)の後続。

---

`specs/feat-weekly-news-dual-focus-search.md` の仕様を実装してください。週間ニュースの取得件数が少ない(試し焼き2回で1件・0件)問題に対し、単一の検索呼び出しを「選手系」「大会系」の2系統に分割し、各回の検索意図を絞ることで実質的な件数増加を狙います。

コンテキスト:
- 対象ファイル: `lib/llm/weekly-news/fetch.ts`、`tests/llm/weekly-news.test.ts`
- `AGENTS.md`を読む

やること:
1. `buildWeeklyNewsSearchPrompt`に`focus: "player" | "competition"`引数を追加し、search intentを分割する:
   - `"player"`: 移籍・契約ニュース、選手・コーチのコメント
   - `"competition"`: 大会・トーナメントの動向、今後の試合に影響する負傷情報
2. `fetchWeeklyNews`が`createWebSearchJsonResponse`を2回(`"player"`・`"competition"`各1回)呼び出す
3. 2回分の結果を`source_url`で正規化(小文字化・末尾スラッシュ除去)して重複排除してからinsertする
4. 既存の鮮度フィルタ・許可ドメインフィルタ(`parseWeeklyNewsResponse`)は両方の呼び出し結果に共通のロジックで適用する(focus別の別実装を作らない)

エッジケース:
- 一方の呼び出しが0件でも、もう一方の結果は通常どおり保存する
- 両方の呼び出しがエラーになった場合の挙動は既存の`fetchWeeklyNews`のエラーハンドリング方針(呼び出し元にthrowする)を踏襲する

やらないこと:
- 呼び出し回数を3回以上に増やすこと
- モバイル側(`tryline-mobile`)の変更
- `weekly_news_items`のテーブル定義変更

完了の定義:
- specs の受け入れ条件 1〜6 を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
