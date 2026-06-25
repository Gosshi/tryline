# 引き継ぎ: cron スケジュール再設計（次セッション用）

## このセッションで判明した問題

**マーキー試合（特に土曜夜キックオフ）の recap が、試合から1日以上遅れて出る。**

### 根因＝cron スケジュール（GitHub Actions、UTC）
cron は `vercel.json`（空 `{}`）でなく **`.github/workflows/cron-*.yml`** で定義:

- **`cron-ingest-live-competitions.yml`**（結果取り込み: finished化・スコア・イベント）
  - `0 2 * * *` ＝ **1日1回・02:00 UTC ＝ 11:00 JST のみ**
- **`cron-orchestrate.yml`**（recap/preview 生成）
  - `0 12 * * *`（21:00 JST）＋ `0 15 * * 6,0`（土日 翌00:00 JST）
- 認証は各ワークフロー `secrets.CRON_SECRET`、エンドポイントは `https://tryline-six.vercel.app/api/cron/<name>`、いずれも `workflow_dispatch` で手動実行可

### 具体的な詰まり（2026-06-20 SRP決勝）
- SRP決勝 KO 16:05 JST。結果取り込みは **11:00 JST に1回だけ**＝試合前に走り終わっており、当日は結果が入らない（status=scheduled のまま）
- 次の取り込みは翌 6/21 11:00 JST → recap は同日 21:00 JST の orchestrate
- 結果：**決勝から丸1日以上遅れて recap 公開**。X の旬（当日〜翌朝）を逃す
- 構造的に「**土曜夜の試合は日曜夜まで recap が出ない**」

## 再設計のゴール
マーキー試合（決勝・代表戦等）の **当日〜数時間以内**に recap を出せるようにする。同時に、過剰な実行で LLM コスト/レート/スクレイプ負荷を増やしすぎない。

## 検討の論点（次セッションで詰める）
1. **`ingest-live-competitions` を1日複数回に**（例: 朝・夕・夜の 3回 / 主要キックオフ後を狙う）。UTC/JST のキックオフ分布（北半球は深夜、SRPは日本昼）を踏まえた時刻設計
2. **`orchestrate` も取り込み直後に走るよう連動**（取り込み→生成のラグ短縮）。理想は「取り込みで status が finished に変わった試合があれば、その直後に生成」
3. **コスト/レート影響の見積もり**：頻度↑で Wikipedia 取得回数・LLM 生成回数がどう増えるか。recap は試合単位キャッシュなので生成は finished 化した試合数ぶんだけ＝増分は限定的のはず
4. **ピンポイント手動運用の整備**：決勝など狙った試合だけ即出しする運用（`workflow_dispatch` を使う手順 or 試合ID指定の手動ジョブ）。今回はそれで凌いだ
5. **キックオフ駆動の検討**（やりすぎ注意）：固定時刻でなく「直近 finished 予定の試合がある時間帯だけ密に回す」案。複雑さとのトレードオフ

## 制約・前提
- 本番への影響あり。スケジュール変更は GitHub Actions の yml 編集＝**Codex 実装＋Owner レビュー/マージ**
- LLM 呼び出しコストは Owner 承認事項（CLAUDE.md）。頻度変更はコスト見積もりを併記
- robots/レート遵守（スクレイプ頻度を上げすぎない）
- recap は試合単位キャッシュ（ユーザー単位でない）＝頻度を上げても生成コストは finished 試合数に比例するだけ

## 関連ファイル
- `.github/workflows/cron-ingest-live-competitions.yml` / `cron-orchestrate.yml`（スケジュール本体）
- `lib/cron/orchestrate.ts`（PREVIEW_WINDOW_START/END_HOURS=12/72、recap候補=finished かつ未生成）
- `lib/ingestion/live-ingest.ts`（`statusChangedToFinished` の試合だけ recap候補化）
- `lib/ingestion/live-competitions.ts`（取り込み対象大会リスト）

## 次セッション冒頭で言うこと（コピペ用）
「cron スケジュールの再設計をしたい。`docs/next-session-cron-redesign.md` 参照。
マーキー試合（特に土曜夜KO）の recap が試合から1日以上遅れる問題を、
ingest-live-competitions と orchestrate の実行頻度/連動を見直して解決したい。
コスト・レート影響を見積もりつつ spec 化して。」
