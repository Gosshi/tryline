`/specs/fix-nations-championship-vercel-ingestion-silent-zero.md` の仕様を実装してください。

**重要: これは調査フェーズです。原因はまだ特定できていません。挙動を変える修正は一切書かず、診断ログの追加のみを行ってください。**

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 2026-07-19、本番の `Cron — Live Pipeline` を2回(自動実行・手動再実行)続けて確認したところ、両方とも `nations-championship-2026` だけが `No matches found for nations-championship-2026` というログを出し、他大会(six-nations-2027・super-rugby-pacific-2026等)は正常に更新されているのに0件で終わっていた。Vercel の runtime log で確認済みで、`ingestLiveCompetition()`(`lib/ingestion/live-ingest.ts` 227-251行目)の早期リターン分岐に入っている＝`fetchNationsChampionship2026()` が例外を投げずに空配列を返したことが確定している
- 同じ2回のタイミングでローカルから同一関数・同一本番DBを直接実行すると、2回とも6試合正しくパースできた。Vercel環境でのみ再現する問題
- **重要な訂正**: 当初「HTTPステータスは200で確定」と考えていたが、セカンドオピニオン(GPT-5.6)の指摘で誤りと判明。`fetchWithPolicy`(`lib/scrapers/fetcher.ts`)は404の場合リトライログを出さずそのまま`FetchError`を投げ、`isMissingWikipediaPage()`(`status===404`のみを見る判定、URLは見ない)がそれを空配列に変換する。つまり「200でパース結果が0件」と「404が握りつぶされて0件」の**2つの経路がどちらも現状のログでは同じに見える**。さらに`isMissingWikipediaPage()`はWikipedia側とWorld Rugby側どちらの404かも区別しない
- GPT-5.6の最有力仮説(モバイル/Parsoidのcontent-wrapper構造がheadingとtableの間にdivを挟む)について、Claude Codeがローカルで`?useparsoid=0`・`?useparsoid=1`・モバイルドメインを比較検証したところ、通常のUAでは構造差が再現できず(全て`heading→table`)、部分的に反証されている(モバイルドメインはUA判定でデスクトップへ即リダイレクトされたため、真のモバイルレンダリングは未検証)。この仮説を追加検証する目的も込みで、可能な限り豊富な診断情報をログに残す

やること:
1. `fetchNationsChampionship2026()`(`lib/ingestion/sources/wikipedia-nations-championship.ts` 172-195行目)内で、Wikipedia側フェッチ(`fetchWithPolicy(sourceUrl)`)とWorld Rugby側フェッチ(`fetchNationsChampionship2026KickoffTimes()`)のエラーを区別できるようにする(`Promise.allSettled`に変えるか、個別try/catchでタグ付けするか)。**両方成功しないと進まない・404なら空配列を返すという既存の挙動は変えない**、エラー発生源が分かるようにするだけ
2. Wikipedia側が404だった場合、および `parseNationsChampionshipLiveHtml()` の結果が空配列だった場合、それぞれ以下を`console.warn`で構造化ログ出力する:
   - HTTPステータスコード
   - `response.url`(最終URL)・`response.redirected`
   - HTMLバイト長
   - HTML全体のSHA-256ハッシュ(Node標準`crypto`モジュール。**生のHTML本文やその先頭文字列は絶対にログに出さない**。著作権のあるスクレイプ済みテキストを再配信しない設計不変条件に抵触するため)
   - `content-type` / `content-length` / `content-encoding` レスポンスヘッダ
   - `age` / `x-cache` / `etag` / `last-modified` / `vary` ヘッダ(あれば)
   - `div.mw-heading` の検出数
   - `section[data-mw-section-id]` の検出数
   - "Round N" として認識できた見出し数
   - Round見出しの直後が`table`だった件数と、`div`経由で`table`を含んでいた件数(別々にカウント)
   - `SCRAPER_USER_AGENT`が`mobile`を含むか(真偽値のみ、値自体は出さない)
   - `process.env.VERCEL_REGION`・`process.env.VERCEL_GIT_COMMIT_SHA`(ローカルではundefinedでよい)
3. 正常系(1件以上パースできた場合)はログを増やさない
4. `parseNationsChampionshipLiveHtml` / `fetchNationsChampionship2026` の戻り値の型・呼び出し元インターフェースは一切変更しない

入出力の例:
- 入力1: `fetchWithPolicy`をモックし、Wikipedia側が200でHTMLを返すが`div.mw-heading`が0件のケース → ログにHTTPステータス200・バイト長・見出し数0等が出る
- 入力2: `fetchWithPolicy`をモックし、Wikipedia側が404を返すケース → ログにHTTPステータス404・Wikipedia由来であることが分かる情報が出る
- 入力3: World Rugby側のフェッチだけが失敗するケース(既存の`fix-nations-championship-schedule-ingestion-crash`対応後は基本発生しないはずだが)→ ログにWorld Rugby由来であることが分かる情報が出る(Wikipedia側の情報とは出さない/別ログにする)

処理すべきエッジケース:
- 既存の正常系テスト(`tests/ingestion/live-sources.test.ts` 784行目付近)でログが増えていないこと
- ログにHTML本文の生テキストが一切含まれないこと(SHA-256ハッシュと構造カウントのみ)
- `parseRoundTableMatches()`のシグネチャを変える必要が出た場合も、戻り値の型`ParsedLiveMatch[]`自体は変えない方法を優先する

完了の定義:
- specs の受け入れ条件1〜8を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` clean
- 変更ファイル一覧を報告する(想定: `lib/ingestion/sources/wikipedia-nations-championship.ts`、`tests/ingestion/live-sources.test.ts`)

要件:
- 「対象外」(実際の修正・section対応・リトライ・User-Agent変更・アラート機構・他大会への横展開・過去4試合の再取り込み)は一切実装しない。原因が分かっていない段階で修正を書かないことが本タスクの核心
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する。推測で進めない

完了時:
- 実装内容・変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
