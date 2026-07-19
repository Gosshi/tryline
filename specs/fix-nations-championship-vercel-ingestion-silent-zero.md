# Nations Championship 2026 の取り込みが Vercel 本番環境でのみ0件になる不具合の診断ログ追加(調査フェーズ)

## 背景

2026-07-19、Nations Championship 2026 Round 3(7/18開催、6試合)のうち4試合(Australia v Italy, Fiji v Scotland, South Africa v Wales, Argentina v England)が試合終了から数時間〜半日以上経っても `matches.status = 'scheduled'`・スコア null のまま残っていることが本番調査で判明した。

**確認済みの事実**(いずれも実データで検証済み、2026-07-19):

1. Vercel MCP の `get_runtime_logs` で該当 cron 実行(`POST /api/cron/ingest-live-competitions` 00:43:51、dep=dpl_5kgwNCSq5hpf95haHkRByJb1jL5g)のログを直接確認したところ、他大会(six-nations-2027: 15件更新、super-rugby-pacific-2026: 83件、premiership-2025-26: 75件、urc-2025-26: 126件等)は正常に更新されている一方、**`nations-championship-2026` のみ `No matches found for nations-championship-2026` というログを出して `counts: {events_inserted:0, matches_inserted:0, matches_updated:0}` を返している**。
2. `No matches found for ...` は `ingestLiveCompetition()`(`lib/ingestion/live-ingest.ts` 227-251行目)の早期リターン分岐でのみ出力される。すなわち `source.fetch()` (= `fetchNationsChampionship2026()`, `lib/ingestion/sources/wikipedia-nations-championship.ts` 172-195行目)が **例外を投げずに空配列を返した**ことが確定している(例外が投げられていれば `Promise.allSettled` の reject 分岐に入り、結果配列から `nations-championship-2026` が丸ごと消えるはずだが、今回は `counts` 付きで存在している)。
3. 同じ時間帯のログをキーワード絞り込みなしで再確認したが、Wikipedia 取得に対する `Retrying ...` 等のリトライログは一切無かった(`fetchWithPolicy` は5xx/429のときのみ `Retrying` を出す設計)。**ただし、これは「HTTP 200確定」を意味しない**: `fetchWithPolicy`(`lib/scrapers/fetcher.ts` 90-112行目)は404の場合リトライせずそのまま `FetchError` を投げるため、404だった場合もログには何も残らない。`fetchNationsChampionship2026()`(`wikipedia-nations-championship.ts` 188行目)はその `FetchError` を `isMissingWikipediaPage(error)`(`status === 404` のみを見る判定)で捕捉し、空配列に変換して返す。**この分岐と「200だがパース結果が0件」の分岐は、現状のログでは区別できない**(セカンドオピニオンとして GPT-5.6 に調査させ、この見落としを指摘された。2026-07-19)。
4. さらに `isMissingWikipediaPage()` はエラーの発生元URLを見ずに `status === 404` のみで判定するため、`fetchNationsChampionship2026()` 内の `Promise.all([fetchWithPolicy(sourceUrl), fetchNationsChampionship2026KickoffTimes()])` の**どちらの取得が404だったか区別できない**。理論上は World Rugby 側の404まで「Wikipediaページ欠落」として空配列に変換されうる(ただし今回の実行では World Rugby 側のプレースホルダースキップ警告が出ており正常動作したことは確認済み)。
5. 直後の01:04 UTC に Owner 承認の上で `gh workflow run "Cron — Live Pipeline"` により**再現試験**を行ったところ、**再び `nations-championship-2026` が `matches_updated:0`** となり、他大会は正常に更新された。
6. 上記2回(00:43 UTC・01:04 UTC)とほぼ同時刻に、Claude Code がローカルから同一の本番 DB・同一の `fetchNationsChampionship2026()` 関数を直接実行したところ、**いずれも6試合全て正しく `finished` + 正スコアでパースできた**(Australia 57-10 Italy / Fiji 17-33 Scotland / South Africa 43-0 Wales / Argentina 24-31 England)。**同じコード・同じ対象 URLで、Vercel経由は2回連続0件・ローカル直接実行は2回連続正常という、単発の偶然ではない再現性のある差異**が確認されている。
7. World Rugby 側のキックオフ時刻取得(`fetchNationsChampionship2026KickoffTimes()`)は両実行とも正常に動作しており、既知のプレースホルダー行(`"NTH 6th" vs "STH 6th"` 等、`fix-nations-championship-schedule-ingestion-crash` で対応済み)を正しくスキップしている。
8. これは新しい種類の不具合である。`fix-nations-championship-schedule-ingestion-crash`(2026-07-12)は World Rugby API のプレースホルダー行が例外を投げて **大会全体が `Promise.allSettled` の reject で結果配列から消える**不具合だったが、今回は結果配列に **`counts:{0,0,0}` 付きで存在**しており症状が異なる(例外ではなく「正常終了 or 404握りつぶしで0件」)。

**GPT-5.6によるセカンドオピニオン調査(2026-07-19)**: 最有力仮説として「VercelがモバイルPage/Parsoidのcontent-wrapper付きHTML(見出し直後がtableでなくdivでラップされる構造)を受け取っている」という説が挙げられた(確信度:高)。Claude Code がこの仮説の再現性をローカルで検証したところ、**部分的に反証された**: 対象ページを `?useparsoid=0`・`?useparsoid=1`・モバイルドメイン(`en.m.wikipedia.org`)の3パターンで直接取得し比較したところ、いずれも `heading->table=6, heading->div>table=0` で構造差は再現できなかった。また `en.m.wikipedia.org` へのリクエストは(現行の`SCRAPER_USER_AGENT`に対して)`en.wikipedia.org` へリダイレクトされ戻ってしまい、真にモバイルレンダリングされたHTMLを取得できなかった(=モバイル説を完全には検証できていない)。よって「Parsoid content-wrapper」説はVercel特有の何か(送信元IP起因のUA/ヘッダ判定、または他の要因)と組み合わさらない限り単独では成立しにくく、確信度はGPT-5.6の当初評価より下げるべきと判断する。

**まだ分かっていないこと**: Vercel が実際に受け取った生のレスポンス(HTTPステータス、Content-Length、`div.mw-heading` の実際の検出数)を直接見る手段が現状のコードに無い。「200だがパース結果が0件」なのか「404がWikipedia欠落として握りつぶされている」のかすら現状のログからは区別できない。**推測で修正を書く段階ではない**。本 spec は診断ログの追加のみを行い、実際の原因はログ取得後に別 spec で対応する。

## スコープ

対象:
1. `fetchNationsChampionship2026KickoffTimes()` の呼び出しと `fetchWithPolicy(sourceUrl)`(Wikipedia側)の呼び出しを、**同じ`try/catch`に束ねたまま**でよいが、**エラーが起きた側を区別できる**ようにする(例: `Promise.allSettled` に変えて個別にハンドリングする、またはそれぞれ独自の try/catch でラップしてエラーに発生源のタグを付ける等。既存の「両方成功したら進む」という前提の挙動自体は変えない)。これにより `isMissingWikipediaPage()` に来た404が Wikipedia 由来か World Rugby 由来かをログで判別できるようにする
2. `fetchNationsChampionship2026()` / `parseNationsChampionshipLiveHtml()` / `parseRoundTableMatches()` に診断用ログを追加し、「0件だった理由」が次回発生時に Vercel の runtime log から特定できるようにする。`parsedMatches.length === 0` になった場合、および Wikipedia 取得が404で空配列にフォールバックした場合、それぞれで以下を `console.warn` で構造化ログ出力する:
   - レスポンスの HTTP ステータスコード
   - `response.url`(リダイレクト後の最終URL)・`response.redirected`
   - 取得した HTML のバイト長(`response.text()` の文字数)
   - HTML 全体の SHA-256 ハッシュ(Node標準の `crypto.createHash("sha256")` を使う。**生のHTML本文やその先頭文字列はログに出さない**。著作権のあるスクレイプ済みテキストを再配信しないという設計不変条件に抵触するため、ハッシュ値と構造カウントのみに留める)
   - `content-type` / `content-length` / `content-encoding` レスポンスヘッダ
   - `age` / `x-cache` / `etag` / `last-modified` / `vary` など、CDNキャッシュの有無を示唆するヘッダ(あれば。無ければ省略可)
   - `div.mw-heading` の検出数(cheerioでロードした `$` に対する `$("div.mw-heading").length`)
   - `section[data-mw-section-id]` の検出数
   - "Round N" として認識できた見出し数(`parseRoundNumber` が非nullを返した件数)
   - Round見出しの直後が `table` だった件数 と、`div` 経由で `table` を含んでいた件数(両方を別々にカウントする。Parsoid content-wrapper 仮説の検証に使う)
   - `SCRAPER_USER_AGENT` が `mobile` を含むか(真偽値のみ。値自体はログに出さない)
   - `process.env.VERCEL_REGION`・`process.env.VERCEL_GIT_COMMIT_SHA`(Vercelが自動注入する環境変数。ローカル実行時は undefined でよい)
   ログは `No matches found for nations-championship-2026` という既存の曖昧なメッセージだけで終わらせない
3. 上記ログ追加後、挙動(パース結果・戻り値・呼び出し元インターフェース)は一切変更しない。**修正ではなく観測性の追加のみ**が本 spec のゴール

対象外:
- 実際の修正(section対応・リトライ・User-Agent変更など)。原因未確定のため今は書かない。次回発生時にログを見てから別 spec で対応する
- Wikipedia 側の HTML 構造が実際に Parsoid 形式へ移行したかどうかの断定
- `Promise.allSettled` の失敗を Slack/Discord 等に能動的にアラートする仕組み(過去 spec で対象外とされた方針を踏襲)
- 他大会ソース(URC・Premiership 等)の同種パーサーへの横展開
- 今回停止した4試合分の本番データ再取り込み自体(cron の後続実行または Owner 承認済みの手動実行で解消する運用課題。本 spec はログ追加のみが目的)

## データモデル変更

なし。

## API サーフェス

なし(既存の `/api/cron/ingest-live-competitions` の内部動作を修正するのみ)。

## LLM 連携

なし。

## 実装方針(提案。詳細実装は Codex 判断)

1. `fetchNationsChampionship2026()`(172-195行目)内で、Wikipedia側フェッチ(`fetchWithPolicy(sourceUrl)`)と World Rugby側フェッチ(`fetchNationsChampionship2026KickoffTimes()`)を、それぞれのエラーを区別できる形に変更する(`Promise.allSettled` を使うか、個別の try/catch でエラーに `source: "wikipedia" | "world-rugby"` のようなタグを付けるか、実装しやすい方でよい)。**ただし挙動(両方成功しないと進まない、404なら空配列を返す)は変えない**
2. Wikipedia側が404だった場合、および `parseNationsChampionshipLiveHtml()` の戻り値が空配列だった場合、それぞれ上記スコープ2のログを出力する。正常時(1件以上)はログを増やさない
3. `div.mw-heading` の検出数・`section[data-mw-section-id]` の検出数・"Round N" 見出し数・heading→table / heading→div>table の件数は `parseRoundTableMatches()`(51-122行目)内で計測するのが自然だが、関数のシグネチャ・戻り値は変更せず、ログ出力のみを追加する形にする
4. SHA-256ハッシュの計算は Node標準の `crypto` モジュールを使う(追加ライブラリ不要)
5. `parseNationsChampionshipLiveHtml`・`fetchNationsChampionship2026` の戻り値の型・呼び出し元インターフェースは一切変更しない

## 受け入れ条件

1. `fetchNationsChampionship2026()` が0件を返すケースで、`console.warn` にスコープ2で列挙した項目(HTTPステータス・レスポンスURL・バイト長・SHA-256ハッシュ・`div.mw-heading`検出数・`section`検出数・"Round N"見出し検出数・heading→table件数・heading→div>table件数)が含まれることを確認するテストがある(`fetchWithPolicy` をモックして空相当のHTMLを返すケースを再現する)
2. Wikipedia側フェッチが404の場合、World Rugby側が404の場合、それぞれ異なるログ(発生源が分かる形)が出ることを確認するテストがある
3. 同関数が1件以上を返す正常系では、上記の追加ログが出力されないことを確認するテストがある
4. ログにHTML本文の生テキスト(先頭文字列を含む)が一切含まれないことをテストまたはコードレビューで確認する(著作権上の制約)
5. ログ追加によって既存のパース結果・戻り値・呼び出し元(`ingestLiveCompetition`)の挙動が一切変わらないことを、既存の統合テスト(`tests/ingestion/live-sources.test.ts` 784行目付近)が変更なく通ることで確認する
6. `pnpm test` 全体が通る
7. TypeScript strict エラーなし
8. 既存の `parseNationsChampionshipLiveHtml` の呼び出し元(`fetchNationsChampionship2026`)・戻り値の型に破壊的変更がない

## 未解決の質問

- 今回の「0件」がWikipedia側の送信元(IPレンジ等)による応答差異か、404の握りつぶしか、Parsoid構造変化か、編集直後の過渡的なレスポンスかは未確定。GPT-5.6のセカンドオピニオンで最有力とされた「モバイル/Parsoidのcontent-wrapper」説は、Claude Codeによるローカル再現テスト(`?useparsoid=0/1`・モバイルドメイン)で部分的に反証されており、確信度は当初評価より低いと考えられる(ただしモバイルドメインへのリクエストがUA判定でデスクトップに即リダイレクトされたため、真のモバイルレンダリングは未検証)。本 spec のログ追加後、次回発生時に Vercel MCP の `get_runtime_logs` で実際の原因(HTTPステータス・HTMLバイト長・見出し数・キャッシュヘッダ)を確認してから、原因に応じた修正を別 spec で起票する。次回発生を待たずに調査を進めたい場合は、Owner 承認の上で `gh workflow run "Cron — Live Pipeline"` を数回手動実行して再現を試みる運用も可(2026-07-19 に実施済み、2回とも再現)
- 同じ兄弟走査パターン(`div.mw-heading` + `cursor.next()`)を使う他のソースファイル(`lib/ingestion/sources/` 配下)が同種のリスクを抱えていないかの横展開調査は、本 spec のスコープ外。Owner が必要と判断すれば別 spec で対応
