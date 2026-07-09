# ライブ取り込みパイプラインで wikipedia_url が一切保存されない問題を修正

## 背景

2026-07-08〜09 の「URC/SRPイベント取り込み」バックログ（`specs/feat-urc-srp-match-events.md`、2026-06-02作成）を再評価する過程で、本番DBを実測したところ、当時の前提（URC 3%・SRP 11%のイベント取得率）は既に大幅改善していた（URC 92%・SRP 96%）ことが判明した。一方で、**より根深い共有バグ**を発見した。

`lib/ingestion/live-ingest.ts` の `toExternalIds`（127-148行目）は、`source`・`wikipedia_event_id`・`wikipedia_round`・`round_name` は `external_ids` に書き込むが、**`wikipedia_url` を一切書き込まない**。この関数は `LIVE_COMPETITION_SOURCES`（`lib/ingestion/live-competitions.ts`、league-one・autumn-nations・nations-championship・pnc・premiership・rugby-championship・six-nations-2027・super-rugby-pacific・top-14・urc の11ソース）全てで共有されている。

本番DB実測（`wikipedia_event_id` はあるが `wikipedia_url` が無い試合数）:

| 大会・シーズン | 欠落件数 |
|------|---:|
| league-one 2025-26 | 114 |
| league-one 2024-25 | 108 |
| super-rugby-pacific 2026（進行中） | 81 |
| premiership 2025-26 | 15 |
| urc 2025-26 | 12 |
| top-14 2025-26 | 5 |
| pnc 2026 | 2 |
| **合計** | **337** |

`wikipedia_url` が無いと、試合個別の再検証・イベント再取得・デバッグ時にソースページを自動特定できない。特に**進行中のSuper Rugby Pacific 2026シーズンで81/83試合が欠落**しており、現在進行形で影響が出ている。

根本原因: 共有型 `ParsedWikipediaMatch`（`lib/ingestion/sources/wikipedia-six-nations.ts:24`、`live-source-utils.ts` 経由で `ParsedLiveMatch` として全ソースが使用）に、そもそも `wikipediaUrl`（または `sourceUrl`）フィールドが存在しない。各ソースの fetch 関数（例: `wikipedia-urc.ts` の `buildWikipediaUrl`）は内部でURLを構築して `fetchWithPolicy` に渡しているが、そのURLを返り値の試合オブジェクトに含めていない。

## スコープ

対象:
- `ParsedWikipediaMatch`型（`lib/ingestion/sources/wikipedia-six-nations.ts`）に `wikipediaUrl: string | null` フィールドを追加する
- `LIVE_COMPETITION_SOURCES` に含まれる各ソースファイルの fetch 関数（`wikipedia-urc.ts`・`wikipedia-premiership.ts`・`wikipedia-top-14.ts`・`wikipedia-super-rugby-pacific.ts`・`wikipedia-pnc.ts`・`league-one-live.ts`・`wikipedia-autumn-nations.ts`・`wikipedia-nations-championship.ts`・`wikipedia-nations-championship-events.ts`・`wikipedia-rugby-championship.ts`・`wikipedia-six-nations-2027-live.ts`）で、各試合オブジェクトに自身が構築したURLを `wikipediaUrl` として含める
- `lib/ingestion/live-ingest.ts` の `toExternalIds`（127-148行目）に、`match.wikipediaUrl` が存在する場合 `externalIds.wikipedia_url = match.wikipediaUrl` を設定する処理を追加する

対象外:
- 既存337件の欠落データに対する個別バックフィルスクリプト（**不要と判断**。`lib/ingestion/upsert.ts:62-63` の `buildMatchUpdate` は `external_ids` を既存値とスプレッドマージする実装のため、本修正後に既存の定期cron（`ingest-live-competitions`）が通常運用で各試合を再訪した際、自動的に `wikipedia_url` が埋まる）
- `feat-urc-srp-match-events.md` のURC専用パーサ実装（既に大幅改善済みのため優先度を下げて別途判断）
- Six Nations（六か国対抗）等、このライブ取り込みパスを経由しない大会の調査（既に別経路で `wikipedia_url` が正しく設定されているため対象外）

## データモデル変更

なし（既存 `matches.external_ids` JSONB の1キー追加のみ）。

## API サーフェス

なし。

## 実装詳細

各ソースファイルで既に `buildWikipediaUrl`（またはそれに相当する関数）でURLを構築しているので、その値を返り値のオブジェクトに追加するだけでよい。例（`wikipedia-urc.ts`）:

```ts
function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_United_Rugby_Championship`;
}

// parseUrcLiveHtml 内、results.push の対象オブジェクトに追加:
results.push({
  // ...既存フィールド...
  wikipediaUrl: sourceUrl, // buildWikipediaUrl(season) の結果を上位から渡す
});
```

`parseUrcLiveHtml(html: string)` は現在URLを引数に取らないため、`fetchUrc202526` から `parseUrcLiveHtml(html, sourceUrl)` のようにURLを渡す形にシグネチャ変更が必要な箇所がある。各ソースファイルの実装は個別に確認し、最小限の変更で対応すること。

## LLM 連携

なし。

## 受け入れ条件

1. `ParsedWikipediaMatch` 型に `wikipediaUrl` フィールドが追加されている
2. 対象11ソースファイル全てで、fetch関数の返り値に正しい `wikipediaUrl` が含まれる（各ソースのユニットテストで検証）
3. `toExternalIds` が `match.wikipediaUrl` を `external_ids.wikipedia_url` に反映する
4. 既存の `tests/ingestion/live-sources.test.ts` 等の関連テストが通り、新規追加分もカバーする
5. 本番の `ingest-live-competitions` cron を手動で1回実行（Owner承認後）し、実行前後で対象試合の `external_ids.wikipedia_url` 欠落件数が減っていることをSQLで確認する（DBスキーマ変更を伴わないため通常のcron実行のみでよい。既存の重複防止・上書き保護ロジックを壊さないことを合わせて確認する）
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- 11ソースファイルのうち、`wikipedia-nations-championship-events.ts` は `wikipedia-nations-championship.ts` と同じURLを共有する可能性がある。実装時に重複コードにならないよう、共通化するかどうかはCodexの裁量とする
- 受け入れ条件5の本番cron実行は、実装・テスト完了後にOwnerが別途承認して実行する。本spec自体はコード変更とテストまでで完了とする
