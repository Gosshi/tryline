`specs/feat-lipovitan-match-events-live.md` の仕様を実装してください。

**着手前に必ず読むこと**:
- `lib/ingestion/sources/wikipedia-nations-championship-events.ts` — **唯一の前例です。構造をそのまま踏襲してください**
- `specs/feat-lipovitan-challenge-cup-live-ingestion.md`（PR #671、マージ済み）— 「既存スクレイパーを書き換えない」方針を採っています。本 spec でもその方針を維持します

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **調査済みの事実（再調査不要。2026-08-09 に実測）**:
  - `lib/ingestion/live-ingest.ts:314-317` が `const rawHtml = eventMatch?.rawHtml ?? match?.rawHtml; if (!match || !rawHtml) { continue; }` となっている
  - `lib/ingestion/sources/wikipedia-lipovitan-challenge-cup.ts` は `rawHtml: ""` を返すため、**空文字が falsy でこの分岐に必ず入り、イベント解析がスキップされる**
  - `LiveCompetitionSource` には `fetchEventMatches?: () => Promise<ParsedLiveMatch[]>` が既に定義されている（`live-ingest.ts:21`）
  - Nations Championship 2026 が `live-competitions.ts:58` でこれを使っている
  - `live-ingest.ts:232-241` が `fetchEventMatches` の結果を `buildParsedMatchKey` でキー化し、312-314行で引き当てる
  - **英語版 `https://en.wikipedia.org/wiki/2026_Australia–Japan_rugby_union_test_series` から19イベントが正しく取得できることを実測済み**（日本 32-35 オーストラリア、合計がスコアと一致）
  - 日本語版は得点者と分表示があるが vevent 構造でないため `parseMatchEventsFromVeventHtml` が読めない
  - `AUSTRALIA_JAPAN_WIKIPEDIA_URL` は `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` で既に export 済み（PR #671）
- 変更対象:
  - `lib/ingestion/sources/` にイベント専用ソースを新規追加
  - `lib/ingestion/live-competitions.ts` の `lipovitan-challenge-cup-2026` エントリに `fetchEventMatches` を追加

実装のポイント:
- **`wikipedia-nations-championship-events.ts` の構造をそのまま踏襲すること。** 独自の設計を持ち込まないでください
- **`buildParsedMatchKey` を実際に読んで、キーの構成要素を確認してから実装してください。** 引き当てが成立しないとイベントが渡りません。ここが本 spec の成否を分けます
- `rawHtml` には英語版シリーズ記事の HTML を入れる。取得は `fetchWithPolicy`（robots 判定・レート制限）
- ページ取得に失敗した場合は例外を投げず空配列を返す（`isMissingWikipediaPage` の既存パターン）
- 既存の `AUSTRALIA_JAPAN_WIKIPEDIA_URL` 定数を再利用してください

エッジケース:
- 英語版ページがまだ得点者を載せていない場合（試合直後）にイベント0件で正常終了すること
- カナダ戦・フィジー戦は英語版の該当記事が存在しない可能性があります。**存在するか確認し、無ければ日豪シリーズのみを対象として報告してください**
- `buildParsedMatchKey` が null を返すケースの扱い（既存コードは `?? ""` で吸収しています）

やらないこと:
- **`lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` の解析ロジック変更**（PR #671 の方針を維持）
- **`lib/ingestion/sources/wikipedia-lipovitan-challenge-cup.ts`（日程・スコア側）の変更**。`rawHtml: ""` のままで構いません。イベント専用ソース側で解決します
- **`lib/ingestion/live-ingest.ts` の変更**
- `app/api/cron/fill-event-gaps/route.ts` および `scripts/fill-event-gaps.ts`（`fix-fill-event-gaps-reliability.md` で別途扱います）
- `parseMatchEventsFromVeventHtml` の ja.wikipedia 対応
- **スコア整合ガードの無効化・緩和**。イベント合計がスコアと合わない場合に登録しない挙動は 2026-06 のイベント汚染事故の教訓です

テスト:
- **イベントソースの結果が日程ソース側の試合と `buildParsedMatchKey` で引き当てられること**（最重要）
- `rawHtml` が空文字でないこと
- ページ取得失敗時に空配列を返すこと
- `live-competitions.ts` に `fetchEventMatches` が登録されていること
- 他大会の取り込みに影響がないこと（既存テストが通る）

完了の定義:
- spec の受け入れ条件1〜10をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **`buildParsedMatchKey` のキー構成を確認した結果と、引き当てが成立することをどう担保したかを報告してください**
- **カナダ戦・フィジー戦の英語版記事が存在したかを報告してください**
- 既存スクレイパーと日程・スコア側アダプタに touch していないことを示してください
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
