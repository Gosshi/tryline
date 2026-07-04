# Nations Championship 2026 のイベント（トライ・ペナルティ等）取り込み追加（P0'）

## 背景

Nations Championship 2026 は開催済み試合（Round 1、日本vsイタリア含む3試合を本番で確認）で `match_events` が0件のまま。原因調査の結果（2026-07-04 本番検証・Web調査）:

1. **スコア取り込み自体は正常**: `lib/ingestion/sources/wikipedia-nations-championship.ts` が参照する `https://en.wikipedia.org/wiki/2026_Nations_Championship`（メインページ）は日付・チーム・スコア・会場のみを持つ簡易テーブルで、個別イベント（トライ等のスコアラー・分数）を含む `vevent`/`rugbybox` 形式のブロックが存在しない。本番で `cron-live-pipeline` を手動実行（`gh workflow run`）して検証済み: 3試合とも正しいスコアで `status=finished` に更新された。**cronの未発火ではない**
2. **イベント詳細は別記事にある**: 実際の試合詳細（トライ・スコアラー・分数、ラインアップ）は `2026_Nations_Championship_Southern_Hemisphere_Series`（7月 Round1-3）と `2026_Nations_Championship_Northern_Hemisphere_Series`（11月 Round4-6）という別記事に掲載されている。Web調査で日本vsイタリアの実際のスコアラー情報を確認済み（例: 「Dearns 10' c」「Matsunaga 16' c」等、分数付き）
3. **既存の共有パーサーがそのまま使える形式**: `lib/ingestion/sources/wikipedia-pnc.ts`（`fetchPnc2026`）が同じ構造（`.vevent.summary` ブロックをセクション見出し単位で収集→ `parseWikipediaSixNationsHtml` で共通パース）で正しく動作している。NC も同型の実装で対応可能（URC/SRPのような未知フォーマットとの格闘ではない）
4. **既に finished 遷移済みの試合は live 経路でイベントが入らない**: `lib/ingestion/live-ingest.ts`（272行目付近）は `statusChangedToFinished`（scheduled→finished に変化した瞬間）だけをイベント生成対象にする。Round1の試合は既に finished 済みのため、新しいイベントソースを追加しても自動では拾われない。`feat-backfill-reparse-existing-urc-events.md`（URC向け実装済み）と同型の再パースバックフィルが必要

## スコープ

対象:
- `lib/ingestion/sources/wikipedia-nations-championship-events.ts`（新規、名称は実装時にCodex判断）: `wikipedia-pnc.ts` と同じパターンで、Southern/Northern 両サブ記事から `.vevent.summary` ブロックを収集し `match_events` を抽出する
- 既存の `lib/ingestion/sources/wikipedia-nations-championship.ts`（メインページ、スコア/ステータス取り込み）は**変更しない**。今朝マージ済みのキックオフ時刻修正（PR #463）がこれに依存しているため、触らない設計とする
- 抽出したイベントを既存試合（チーム名ペア＋日付でマッチング。今朝のキックオフ時刻オーバーレイと同じ方式）に対して `upsertMatchEvents`（`lib/ingestion/events.ts`。delete→insertで冪等）
- `feat-backfill-reparse-existing-urc-events.md` と同型の再パース用バックフィルスクリプト（`--reparse-existing` 相当）を追加し、既に finished 済みの Round1 試合（今後 Round2, 3 も同様）にイベントを補完できるようにする
- 対応するテスト

対象外:
- メインページの `wikipedia-nations-championship.ts` パーサー自体の変更・統合（役割を分離したまま維持する）
- Finals Weekend（対象記事未作成のため）
- ラインアップ（`match_lineups`）取り込みは `specs/backfill-nations-championship-wikipedia-urls.md`（P0）経由の既存 `ingest-lineups` 経路に任せる。本specはイベントのみ

## データモデル変更

なし。`match_events` は既存テーブル。

## 実装方針（提案）

1. `wikipedia-pnc.ts` の `collectSectionVevents` / `wrapVeventsWithFixturesSection` パターンを参考に、Southern/Northern 両記事から `.vevent.summary` ブロックを収集する関数を作る（PNCと違いNCはセクション見出しが `Round_1`〜`Round_6` のように既にラウンド番号付きのため、PNCのような「日付順にラウンド番号を割り当てる」ロジックは不要かもしれない。実装時に実ページ構造を確認すること）
2. `parseWikipediaSixNationsHtml`（共有パーサー）でイベント・スコアラーを抽出する
3. 抽出結果をチーム名ペア＋日付で既存 `matches` にマッチングし、`upsertMatchEvents` を呼ぶ
4. `lib/ingestion/live-competitions.ts` の `LIVE_COMPETITION_SOURCES` に新ソースを追加するか、専用のcronルートを作るか（既存メインページソースと同じ大会slugに対して2つのソースが並存する形になるため、`live-ingest.ts`側の設計を確認し、衝突しない形にすること）
5. バックフィルスクリプト: `feat-backfill-reparse-existing-urc-events.md` の `--reparse-existing` と同じ思想で、finished済みNC試合を対象にイベントを再取得・upsertする

## 受け入れ条件

1. Southern Hemisphere Series記事から日本vsイタリア戦のイベント（トライ・スコアラー・分数）が正しく抽出できることを実データ（本spec記載のWeb調査結果）ベースのフィクスチャで確認する単体テスト
2. 新ソース追加後も既存の `wikipedia-nations-championship.ts`（メインページ・スコア取り込み）の既存テストが壊れない
3. バックフィルスクリプトの dry-run で、現在finished済みのNC試合（Round1、3試合以上）が対象として表示される
4. バックフィル実行後、対象試合の `match_events` が0件でなくなる（本番確認は Owner 承認後に別途実行）
5. 冪等性: 再実行しても二重計上にならない（`upsertMatchEvents` の delete→insert 特性を活かす）
6. `pnpm test`・`pnpm tsc --noEmit` 通過

## 今回発覚した個別対応（spec範囲外・Owner判断事項）

- 本specマージ後、既にfinished済みのRound1試合（日本vsイタリア含む）へのバックフィル実行はOwner承認後に別途実行する
- Round2（7/11）・Round3（7/18）は本specのライブ経路が正しく機能すれば自動的にイベントが入る想定。効果測定は各ラウンド終了後に確認する

## 未解決の質問

- NCのセクション見出し構造（`Round_1`〜`Round_6` が本当にPNCと同じ `.vevent.summary` 形式か、ラウンドごとの見出しレベル(h2/h3)）は実装時にCodexが実ページを取得して確認すること
- 同一大会slugに対し「メインページソース（スコア）」と「サブ記事ソース（イベント）」の2つの取り込み元が並存する設計が `live-competitions.ts`/`live-ingest.ts` の既存アーキテクチャと整合するか、実装時に確認し、整合しない場合は設計を相談すること
