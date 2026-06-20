# Six Nations 2027 をライブソースへ統合（重複取り込みパスの撤去）

## 背景

Six Nations 2027 の結果取り込みは、汎用ライブ取り込み（`LIVE_COMPETITION_SOURCES` + `ingestLiveCompetition`）とは別に、専用の `lib/ingestion/results.ts`（`ingestSixNations2027Results`）として**重複実装**されている。team lookup → upsert → vevent イベント抽出という同じ処理を二重に持っている。

この重複は2つの実害につながる:

1. **保守の二重化**: ライブ取り込み側のバグ修正・改善（phantom event 除去、team 解決の拡張など）が Six Nations 専用パスに反映されない。
2. **遅延問題の再来**: Six Nations 2027（2027年2〜3月、欧州開催）は土曜キックオフ＝まさに「土曜夜の試合 recap が遅れる」問題の対象。しかし専用 cron `cron-ingest-results.yml` は **週末 17:00 UTC（02:00 JST）の週2回のみ**で、6時間ごとの新ライブパイプライン（`specs/refactor-cron-live-pipeline.md`）に乗っていない。このままだと RWC 直前の目玉大会で recap が再び1日遅れる。

`specs/refactor-cron-live-pipeline.md` の据え置き判断を受けた**フォローアップ**。Six Nations 2027 開幕（2027年2月）までに完了させる。

## スコープ

対象:
- Six Nations 2027 を `LIVE_COMPETITION_SOURCES`（`lib/ingestion/live-competitions.ts`）の1ソースとして追加
- 専用取り込みパスの撤去: `lib/ingestion/results.ts`（`ingestSixNations2027Results`）、`app/api/cron/ingest-results/route.ts`、`.github/workflows/cron-ingest-results.yml`
- 統合により Six Nations 2027 が自動的に `cron-live-pipeline`（6時間ごと）に乗る

対象外:
- パース処理本体（`lib/ingestion/sources/wikipedia-six-nations.ts`）の変更。既存パーサをそのまま再利用する
- 他大会のソース定義
- DB スキーマ変更
- `cron-live-pipeline.yml` の変更（ソースを増やすだけで自動的に対象になる）

## データモデル変更

なし。ただし `competitions` テーブルに `slug = "six-nations-2027"` の行が必要。
- 現状の専用パス `getCompetition()` は既存行を前提（`.single()`）だが、ライブパスの `upsertCompetition()` は無ければ作成する。移行後は upsert されるため、行が無くても初回取り込みで作成される。
- 既存の `six-nations-2027` 行・既存試合・既存 recap との整合（slug を変えないこと）を保つ。

## API サーフェス

撤去:
- `POST /api/cron/ingest-results`（route 削除）

新規・変更なし（Six Nations は既存の `POST /api/cron/ingest-live-competitions` 経由で取り込まれるようになる）。

### 変更するファイル

1. **新規ソースアダプタ**（`lib/ingestion/sources/` 配下、例 `wikipedia-six-nations-2027-live.ts`）
   - 既存ライブソース（例 `wikipedia-premiership.ts` の `fetchPremiership202526`）と同じ形で、`() => Promise<ParsedLiveMatch[]>` を実装。
   - 中身: `fetchWithPolicy(WIKIPEDIA_SIX_NATIONS_2027_URL)` → `parseWikipediaSixNations2027Html(html)` → `ParsedLiveMatch[]` を返す。
   - `ParsedLiveMatch = ParsedWikipediaMatch & { awayTeamSlug?, homeTeamSlug? }`（`lib/ingestion/sources/live-source-utils.ts:7`）。Six Nations パーサは既に `ParsedWikipediaMatch` を返すため、slug 無しでもそのまま代入可能（live-ingest 側は slug 無→name で team 解決）。

2. **`lib/ingestion/live-competitions.ts`**: `LIVE_COMPETITION_SOURCES` に Six Nations 2027 を追加。
   ```ts
   {
     competitionName: "Six Nations 2027",
     competitionSlug: "six-nations-2027",   // 既存 slug を厳守
     family: "six-nations",
     fetch: fetchSixNations2027,
     season: "2027",
     sourceLabel: "wikipedia",
   }
   ```
   - `family` は新規 `"six-nations"`。`live-ingest.ts:201` の event パーサ分岐は `family === "urc"` のみ特別扱いで、それ以外は `parseMatchEventsFromVeventHtml`。Six Nations は vevent 形式なのでデフォルト分岐で正しく動く（旧 `results.ts` も同じパーサを使用）。

3. **撤去**: `lib/ingestion/results.ts`（`ingestSixNations2027Results` とその専用ヘルパ）、`app/api/cron/ingest-results/route.ts`、`.github/workflows/cron-ingest-results.yml`。
   - `lib/ingestion/sources/wikipedia-six-nations-2027.ts` の re-export（`WIKIPEDIA_SIX_NATIONS_2027_URL` 等）は新アダプタで使うので**残す**。

## UI サーフェス

なし。

## LLM 連携

なし（取り込み層のみ。生成は既存パイプラインがそのまま担当）。コスト増分なし（Six Nations 試合数は不変、生成は試合単位キャッシュ）。

## 受け入れ条件

1. `LIVE_COMPETITION_SOURCES` に `competitionSlug: "six-nations-2027"` のエントリが追加され、`fetch` が新アダプタを指す。
2. 新アダプタが `ParsedLiveMatch[]` を返し、`ingestAllLiveCompetitions()` 経由で Six Nations 2027 の試合が upsert される。
3. finished 化した Six Nations 試合のイベントが `parseMatchEventsFromVeventHtml` で挿入される（旧 `results.ts` と同等の event 抽出結果）。
4. `lib/ingestion/results.ts`（`ingestSixNations2027Results`）、`app/api/cron/ingest-results/route.ts`、`.github/workflows/cron-ingest-results.yml` が削除されている。これらへの参照が他に残っていない（grep で 0 件）。
5. `six-nations-2027` の既存 competition slug／既存試合との不整合が生じない（新規 slug を作らない）。
6. 既存テストが通り、ライブ取り込みの新ソース分のテストが追加されている（最低: アダプタが finished/scheduled を正しく判定、team 解決が name 経由で成立）。

### 検証の要注意点（Codex が確認すべきエッジケース）

- **per-match `rawHtml`**: `live-ingest.ts` の event 抽出は `match.rawHtml` を入力にする（`live-ingest.ts:276-283`）。Six Nations パーサが各試合に `rawHtml` を埋めているか確認。埋めていなければアダプタ側で補完する（旧 `results.ts` がどう rawHtml を渡していたか参照）。
- **team 名の解決**: Six Nations のチーム名（England, France 等）が `teams` テーブルの `name` と一致するか。slug を持たないため name 解決に依存（`live-ingest.ts:224-237`）。不一致なら従来も取り込めていないはずだが、念のため確認。
- **競技 family の影響範囲**: 新 `family = "six-nations"` を参照する箇所（standings 解決・UI 分岐・competition guide 等）が無いか grep。必要なら別途対応（本 spec 対象なら明記、対象外なら未解決の質問へ）。

## 未解決の質問

1. **`family` 値**: `"six-nations"` で確定してよいか。既存データ（`competitions.family`）で Six Nations 用の family が既に使われていないか Owner 確認。
2. **過去シーズンの Six Nations**: 2026 以前の Six Nations をライブソース化する予定はあるか。本 spec は 2027 のみ。将来複数シーズンを扱うならソース定義の汎用化を別途検討。
3. **撤去タイミング**: `cron-ingest-results` 撤去は Six Nations 2027 がライブパイプラインで正しく取り込めることを確認してからにするか（安全側）。並行稼働期間を設けるか即時切替か。
