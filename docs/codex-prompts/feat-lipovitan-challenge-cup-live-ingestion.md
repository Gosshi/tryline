`specs/feat-lipovitan-challenge-cup-live-ingestion.md` の仕様を実装してください。

**着手前に必ず読むこと**:
- `specs/feat-lipovitan-challenge-cup-2026.md`（マージ済み）。同 spec が**意図的に自動 cron 化を対象外とした**経緯があります。本 spec はその判断の見直しであり、既存のスクレイパーとスクリプトは壊さずに残します
- `lib/ingestion/sources/wikipedia-greatest-rivalry.ts`（2026-08-07 実装）。**同種の要件で動作している実例なので、構造をそのまま踏襲してください**

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **調査済みの事実（再調査不要）**:
  - `lib/ingestion/live-competitions.ts` には11大会が登録されており、`lipovitan-challenge-cup-2026` は含まれていない
  - `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` は既に存在し、日本語版 Wikipedia・英語版の日豪シリーズ・JRFU の3ソースを参照している
  - `scripts/import-lipovitan-challenge-cup-results.ts` も既に存在する（`EXPECTED_MATCH_COUNT = 4`）
  - `competitions` の `lipovitan-challenge-cup-2026` 行と全4試合は投入済み
  - **`match_events` の取得には `external_ids.wikipedia_url` が英語版である必要がある**。日本語版は `parseMatchEventsFromVeventHtml` が読めず `no unique event block found` になる（2026-08-09 実測）。英語版へ差し替えたところ19イベントを正しく取得できた
  - 一方で**スコアの反映は日本語版の方が早い**（8/8 の試合で、日本語版に結果が載った時点で英語版はメンバー表のみだった）
- 変更対象:
  - `lib/ingestion/sources/` に新規モジュール
  - `lib/ingestion/live-competitions.ts` に登録

実装のポイント:
- **`wikipedia-greatest-rivalry.ts` の構造をそのまま踏襲すること。** 独自の設計を持ち込まないでください
- 既存スクレイパーの戻り値型（`LipovitanChallengeCupMatchResult`）と live ingestion が要求する型（`ParsedLiveMatch`）が異なります。**既存スクレイパーを書き換えず、変換層（アダプタ）を設けてください**
- **`external_ids.wikipedia_url` には英語版 URL を設定すること**。日豪シリーズは既にスクレイパー内で `AUSTRALIA_JAPAN_WIKIPEDIA_URL` として定数化されています
- カナダ戦・フィジー戦に対応する英語版記事が存在するかを確認してください。**存在しなければ `wikipedia_url` を設定せず、その旨をログに出すこと**。誤った URL を入れるとイベント取得が別試合を拾う危険があります

エッジケース:
- 既に `finished` かつスコアが入っている試合を null で上書きしないこと
- `wikipedia_event_id` による同定が働き、4試合が重複登録されないこと
- Wikipedia ページが取得できない場合に例外を投げず空配列を返すこと（既存モジュールと同じ挙動）
- 日本語版にスコアがあり英語版に無い時間帯（試合直後）でも、スコアだけ先に取り込めること

やらないこと:
- `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` の解析ロジック変更
- **`scripts/import-lipovitan-challenge-cup-results.ts` の削除**。自動化が失敗したときの退避手段として残します
- JAPAN XV vs マオリ・オールブラックス戦の追加（元 spec の対象外を維持）
- `autumn-nations` 等、他の手動運用大会への横展開
- `fill-event-gaps` 側の改修（別 spec で扱います）
- 大会ハブページ・ナビゲーションの変更
- cron の実行頻度の変更

テスト:
- `live-competitions.ts` に登録されていること
- アダプタが `LipovitanChallengeCupMatchResult` を `ParsedLiveMatch` へ正しく変換すること
- `wikipedia_url` に英語版が設定されること
- 英語版記事が無い試合で `wikipedia_url` が未設定になること
- 既存の `finished` 試合のスコアを null で上書きしないこと
- 他大会の取り込みに影響がないこと（既存テストが通る）

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **スコアの取得元と `wikipedia_url` の使い分けをどう実装したかを報告してください**
- **カナダ戦・フィジー戦の英語版記事が存在したかどうかを報告してください**
- アダプタをどこに置いたか、既存スクレイパーに触れていないことを示してください
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
