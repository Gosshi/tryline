# Codex プロンプト: 汚染イベントのクリーンアップと再発防止

仕様: `specs/fix-contaminated-match-events.md` を参照（根因チェーン・同定ロジック・ガード仕様はすべて仕様書に記載）。

## タスク

1. **Part A**: 複数試合に同一イベントセットがコピーされた汚染（Autumn Nations 31試合・SRP 6試合、published recap 35本に影響）を検出・削除し、該当 recap を draft に降格するスクリプトを作る
2. **Part B**: 汚染の混入経路だった `fill-event-gaps.ts` のページ全体フォールバックを除去し、挿入前スコア整合ガードを追加する

## 変更ファイルと内容

### 1) `scripts/cleanup-contaminated-events.ts`（新規）

`scripts/fill-event-gaps.ts` の構成（client 取得・`parseOptions`・main パターン）を踏襲する。

- 全 finished 試合の match_events を取得し、試合ごとに署名（`type|minute|player_id` をソート連結→md5）を計算
- 同一署名を共有する試合が2件以上かつイベント数4件以上のグループを汚染と判定
- デフォルト（`--dry-run` 相当）: グループごとに試合一覧（home/away チーム名・kickoff 日付・イベント数・published recap の有無）を表示して終了
- `--confirm-owner-approved` 指定時のみ:
  1. 汚染グループ内の全試合の `match_events` を DELETE
  2. 該当試合の `match_content`（`content_type='recap'` AND `status='published'`）を `status='draft'` に UPDATE
  3. サマリー表示: `Deleted N events across M matches, demoted K recaps to draft`

### 2) `scripts/fill-event-gaps.ts` — フォールバック除去（L152-163）

`extractEventHtml` の戻り値型を `string | null` に変更:
- `eventId` が null → `null` を返す（従来はページ全体を返していた）
- `eventId === "mw-content-text"` → `null` を返す
- アンカー未発見 → `null` を返す（従来はページ全体を返していた）

`fillMatch` 側: `null` のとき `console.log("  -> event anchor not found, skipping")` して `return 0`。

### 3) `scripts/fill-event-gaps.ts` — 挿入前スコア整合ガード

- `loadGapMatches` の select に `home_score, away_score` を追加（`MatchGapRow` 型も更新）
- `fillMatch` で `upsertMatchEvents` の前に、teamSide ごとのイベント得点合計（try=5 / conversion=2 / penalty_goal=3 / drop_goal=3）を計算
- **どちらかの側でイベント合計 > 最終スコア**なら `console.warn` してスキップ（`return 0`）。コード例は仕様書参照

## エッジケース

- `home_score` / `away_score` が null の試合: ガードはスキップ判定をせず挿入を許可（null 比較に注意）
- 署名計算で `minute` / `player_id` が null のイベント: 空文字に正規化して連結（順序が安定すること）
- 汚染グループに draft recap しかない試合: DELETE は行うが demote 対象は 0 件として正常終了

## テスト

- `extractEventHtml`: アンカー有り→ブロック返却 / アンカー無し→null / eventId null→null / `mw-content-text`→null の4ケース
- スコア整合ガード: 合成イベント（ev 合計がスコア超過）でスキップされること、正常データで挿入に進むこと
- 署名グルーピング: 同一イベントセットを持つ2試合が検出され、イベント3件以下のグループは除外されること
- クリーンアップの DELETE / UPDATE は Supabase client をモックして検証（実 DB に接続しない）

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `scripts/cleanup-contaminated-events.ts`（新規）・`scripts/fill-event-gaps.ts`・テストファイル
- マイグレーションなし。**スクリプトの本番実行は Owner が行う**（実装に含めない）
