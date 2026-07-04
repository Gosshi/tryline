# Nations Championship 2026 / Six Nations 2027 の wikipedia_url 補完（P0）

## 背景

本番確認済み（2026-07-04）: `matches.external_ids.wikipedia_url` が **Nations Championship 2026 の36試合・Six Nations 2027 の15試合とも0件**。この値は `app/api/cron/ingest-lineups/route.ts` が確定ラインアップ取り込みの入力として使う（未設定だと `400 { error: "matches.external_ids.wikipedia_url is not set" }` を返し、`lib/cron/orchestrate.ts` はこれを `no_url` として記録してスキップする）。

**根本原因**: 両大会とも試合取り込み時に `wikipedia_url` を設定するステップが無かった（新設大会・新シーズンのため既存の `scripts/seed-wikipedia-external-ids.ts` の対象大会リストに含まれていない。また同スクリプトは `status = 'finished'` の試合のみを対象にしており、キックオフ前のラインアップ取り込みには使えない設計）。

**確認済みの正しいURL**（2026-07-04 Web調査）:
- Nations Championship 2026 Round 1〜3（7月、日本vsイタリア等18試合）: `https://en.wikipedia.org/wiki/2026_Nations_Championship_Southern_Hemisphere_Series`
- Nations Championship 2026 Round 4〜6（11月、18試合）: `https://en.wikipedia.org/wiki/2026_Nations_Championship_Northern_Hemisphere_Series`
- Finals Weekend（11/27-29、6試合）: 対象記事 `2026_Nations_Championship_Finals` は現時点で未作成（出場チーム未確定のため、当該試合行自体がまだ `matches` テーブルに存在しない）。**本specの対象外**
- Six Nations 2027: `https://en.wikipedia.org/wiki/2027_Six_Nations_Championship`（既存コードの定数 `WIKIPEDIA_SIX_NATIONS_2027_URL`（`lib/ingestion/sources/wikipedia-six-nations-2027.ts:3`）と同一。スクリプトはこの定数を import して再利用すること）

## スコープ

対象:
- Nations Championship 2026 の既存36試合（Finals Weekend除く）に、ラウンド番号に応じて上記2つのURLのいずれかを `external_ids.wikipedia_url` として設定する
- Six Nations 2027 の既存15試合に、対応するWikipediaシーズンページURLを設定する
- 上記を実行する読み取り安全なバックフィルスクリプト（dry-runデフォルト・`--confirm-owner-approved`必須。`scripts/backfill-nations-championship-kickoff-times.ts` と同じ規約）

対象外:
- Finals Weekend 6試合（対象記事が存在せず、試合行自体も未作成のため）
- `scripts/seed-wikipedia-external-ids.ts` の汎用化・大会リスト拡張（このスクリプトは `status='finished'` 前提の設計であり、本用途（キックオフ前のラインアップ取り込み）に合わないため新規スクリプトとする）
- ラインアップ取り込み自体の実行（`ingest-lineups` は既存の cron/orchestrate 経路が自動的に拾う。本specはURLを設定するだけ）

## データモデル変更

なし。`matches.external_ids`（既存JSON列）に `wikipedia_url` キーを追加・更新するのみ。

## 実装方針（提案）

`scripts/backfill-nations-championship-wikipedia-urls.ts`（新規、`backfill-nations-championship-kickoff-times.ts` と同じ構成）:

1. `nations-championship-2026` の試合を取得し、`external_ids.round`（または既存の round 情報）が 1〜3 なら Southern URL、4〜6 なら Northern URL を設定
2. `six-nations-2027` の試合を取得し、正しいシーズンページURLを設定（Codexが実装時に確認）
3. 既存の `external_ids` オブジェクトを破壊的に上書きしない（他のキー、例えば `wikipedia_event_id` 等があれば温存し、`wikipedia_url` キーだけ追加・更新する。イミュータブルな更新）
4. dry-run で対象件数・変更前後の値を表示、`--confirm-owner-approved` で実際に `UPDATE`

## 受け入れ条件

1. dry-run 実行で、NC 2026 の18+18件・Six Nations 2027 の15件、計51件が対象として表示される
2. 本実行後、本番の `matches.external_ids.wikipedia_url` が対象51件で正しいURLに設定されている（NC Round1-3はSouthern URL、Round4-6はNorthern URL）
3. 既存の `external_ids` の他のキー（存在する場合）が保持されている
4. 対象外（Finals Weekend）の試合は変更されない
5. `pnpm test`・`pnpm tsc --noEmit` 通過。ラウンド判定ロジックの単体テストを含む

## 未解決の質問

なし（以下は本番DB検証済み・2026-07-04）:

- **ラウンド判定**: `matches.external_ids.wikipedia_round` に文字列 `"1"`〜`"6"` が全36試合分設定済み（Round 1〜3 = 7月各6試合、Round 4〜6 = 11月各6試合を実クエリで確認）。これをそのまま判定に使うこと
- **保持すべき既存キー**: NC 2026 の `external_ids` には `source`・`wikipedia_event_id`・`wikipedia_round` が既に存在する。イミュータブルなマージで `wikipedia_url` キーのみ追加すること（実装方針3の通り）
- **Six Nations 2027 の URL**: 上記の通り既存定数を再利用
