# リポビタンDチャレンジカップを自動取り込みへ移行する（手動運用の判断見直し）

## 背景

`feat-lipovitan-challenge-cup-2026.md`（マージ済み）は、本大会の取り込みを**意図的に手動 CLI に留めた**。

> 対象外（v1）: 自動cron化（`autumn-nations`と同様、手動実行のCLIスクリプトのままでよい）

本 spec はこの判断を見直すものであり、**バグの修正ではない**。2026-08-08 の日本 vs オーストラリア戦で手動運用の実コストが初めて測定できたため、判断材料が揃った。

### 2026-08-08 に実際に起きたこと

日本代表の主要試合（花園、観客21,322人、32-35）で、**結果の公開までに約14時間**を要した。

| 時刻(JST) | 出来事 |
|---|---|
| 21:00頃 | 試合終了 |
| 23:07 | DB は `status='scheduled'`、スコア null のまま。`cron-live-pipeline` を手動実行しても対象外のため入らない |
| 23:20頃 | 大会が `lib/ingestion/live-competitions.ts` に未登録であることを特定 |
| 23:30頃 | `scripts/import-lipovitan-challenge-cup-results.ts 2026` を Owner が手動実行しスコア投入 |
| 23:35頃 | 得点イベントが0件のため recap 生成が `skipped` になることが判明 |
| 翌00:30頃 | `external_ids.wikipedia_url` が日本語版を指しており `parseMatchEventsFromVeventHtml` が読めないと判明。英語版へ手動で差し替え |
| 翌01:00頃 | `cron-fill-event-gaps` 実行、イベント19件を取得 |
| 翌11:00 | recap 生成・公開 |

この間、試合ページは**終了した試合を「予定」と表示し続けた**。X の結果投稿に試合ページの URL を添えられず、導線を1本失っている。

### 影響は今回だけではない

同大会には**日本代表の試合があと3つ**残っている。いずれも同じ状態になる。

| 日付(JST) | 対戦 | 会場 |
|---|---|---|
| 2026-08-15 | オーストラリア vs 日本 | タウンズビル |
| 2026-09-05 | 日本 vs カナダ | 新潟 |
| 2026-10-24 | 日本 vs フィジー | 東京 |

日本代表戦は集客戦略の中心であり、**結果公開の遅延がそのまま機会損失になる**。

### 既存の資産

新規実装は最小限で済む。以下は既に存在する。

- `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts`（スクレイパー本体。日本語版 Wikipedia・英語版の日豪シリーズ・JRFU の3ソースを参照）
- `scripts/import-lipovitan-challenge-cup-results.ts`（手動投入スクリプト。`EXPECTED_MATCH_COUNT = 4`）
- `competitions` の `lipovitan-challenge-cup-2026` 行と全4試合

不足しているのは **`lib/ingestion/live-competitions.ts` への登録**と、そこが要求する形式へのアダプタである。

### 重要: イベント取得には英語版 URL が必要

2026-08-09 に判明した事実として、**`match_events` の取得には `external_ids.wikipedia_url` が英語版を指している必要がある**。

- 日本語版（`ja.wikipedia.org/wiki/リポビタンDチャレンジカップ2026`）には得点者と分表示が存在するが、`parseMatchEventsFromVeventHtml` は英語版の vevent 構造を前提としており `no unique event block found` で読めない
- 英語版（`en.wikipedia.org/wiki/2026_Australia–Japan_rugby_union_test_series`）へ差し替えたところ、19イベントが正しく取得できた（合計32-35でスコアと一致）

一方で**スコアの反映は日本語版の方が早い**。8/8 の試合では、日本語版に結果が載った時点で英語版はまだメンバー表のみだった。

したがって「**スコアは日本語版、`wikipedia_url` は英語版**」という使い分けが要る。

## スコープ

対象:
- `lib/ingestion/sources/` に本大会用の取り込みモジュールを追加する
- `lib/ingestion/live-competitions.ts` に登録する
- 取り込み時に `external_ids.wikipedia_url` へ**英語版 URL** を設定する（イベント取得のため）

対象外:
- `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` の解析ロジック変更（既存の抽出は動作している）
- `scripts/import-lipovitan-challenge-cup-results.ts` の削除。**手動実行の経路は残す**（自動化が失敗したときの退避手段）
- JAPAN XV vs マオリ・オールブラックス戦の扱い（元 spec の対象外を維持）
- `autumn-nations` など他の手動運用大会の自動化（横展開は別途判断）
- `fill-event-gaps` 側の改修（ja.wikipedia 非対応・抽出順序の欠陥は別 spec）
- 大会ハブページ・ナビゲーションの変更

## データモデル変更

**なし。マイグレーション不要。** 既存の `competitions` / `matches` 行を更新するのみ。

## API サーフェス

### 取り込みモジュール

`lib/ingestion/sources/wikipedia-greatest-rivalry.ts` を**そのままの構造で**踏襲すること。同モジュールは 2026-08-07 に同種の要件（Wikipedia 由来・特殊 URL・既存チーム）で実装され、動作している。

`lib/ingestion/live-competitions.ts` への登録は既存エントリと同じ形にする。

```
{
  competitionName: "Lipovitan-D Challenge Cup 2026",
  competitionSlug: "lipovitan-challenge-cup-2026",
  family: "lipovitan-challenge-cup",
  fetch: <新規 fetch 関数>,
  season: "2026",
  sourceLabel: "wikipedia",
},
```

既存スクレイパーの戻り値型（`LipovitanChallengeCupMatchResult`）と live ingestion が要求する型（`ParsedLiveMatch`）が異なるため、**アダプタが要る**。既存スクレイパーを書き換えるのではなく、変換層を設けること。

### `wikipedia_url` の設定

取り込み時、各試合の `external_ids.wikipedia_url` に**英語版のシリーズ記事 URL** を設定する。日豪シリーズは既にスクレイパー内の `AUSTRALIA_JAPAN_WIKIPEDIA_URL` として定数化されている。

カナダ戦・フィジー戦に対応する英語版記事が存在するかは実装時に確認すること。**存在しない場合は `wikipedia_url` を設定せず、その旨を報告すること**（誤った URL を入れるとイベント取得が別試合を拾う危険がある）。

## UI サーフェス

なし。既存の大会ハブと試合ページがそのまま使われる。

## LLM 連携

なし。取り込みのみ。recap 生成は既存パイプラインが `matches` と `match_events` を見て自動的に対象化する。

## 受け入れ条件

1. `lib/ingestion/live-competitions.ts` に `lipovitan-challenge-cup-2026` が登録されている。
2. 取り込み cron の対象になり、`status='scheduled'` の試合が終了後に `finished` とスコアへ更新される。
3. 取り込み後の `external_ids.wikipedia_url` が**英語版**を指している（日本語版ではない）。英語版記事が存在しない試合では未設定であり、その旨がログに出る。
4. 既存4試合が重複登録されない（`wikipedia_event_id` による同定が働く）。
5. 既に `finished` かつスコアが入っている試合を、null で上書きしない。
6. `scripts/import-lipovitan-challenge-cup-results.ts` が引き続き動作する（手動経路の維持）。
7. 既存スクレイパーの解析ロジックが変更されていない。
8. 他大会の取り込みに影響がない（既存テストが通る）。
9. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **スコアの取得元と `wikipedia_url` の使い分けをどう実装するか。** 日本語版の方が結果の反映が早いが、イベント取得には英語版が要る。スクレイパーは既に両方を参照しているため、取り込み時にどちらを `wikipedia_url` として保存するかの判断だけが問題になる。実装時に方式を決めて報告すること。

2. **カナダ戦・フィジー戦の英語版記事が存在するか未確認。** 日豪シリーズには専用記事があるが、他2試合は 2026 年のテストマッチ一覧などに含まれる可能性がある。存在しなければイベント取得はできず、recap も生成されない。

3. **`autumn-nations` も同じ手動運用である。** 本 spec は Lipovitan のみを対象とするが、同じコストが他大会でも発生しうる。横展開の要否は別途判断。

4. **取り込み頻度が6時間ごとで足りるか。** `cron-live-pipeline` は 09/15/21/03 JST に走る。19:05 キックオフの試合は21:00 の実行とほぼ同時刻で取りこぼす可能性がある（8/8 で実際に発生）。頻度の見直しは本 spec の対象外だが、自動化しても土曜夜の試合は翌03:00 まで反映されない可能性が残る。
