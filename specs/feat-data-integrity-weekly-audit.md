# データ整合性の週次監査cron

## 背景

2026-07-08 のコンテンツ品質監査で、以下の事故が「偶然の発見」でしか判明していなかったことが分かった:
- イベント汚染（複数試合が同一 `match_events` を共有、`fix-contaminated-match-events.md` / `fix-nations-championship-event-contamination.md`）
- 統計捏造（実在選手への誤った数値、`feat-recap-player-stat-verification.md`）
- 297件の draft 化事故（`project_regen_length_incident` メモリ参照）

いずれも「本番公開後にたまたま気づく」形で発覚しており、発生から発見までのリードタイムが数週間に及ぶケースがあった。現状、生成時点の個別ガード（`fix-score-event-integrity-check.md`・`fix-derived-stats-event-integrity-gate.md`・人名グラウンディングゲート等）は充実しているが、**既に存在するデータを横断的・定期的に再チェックする仕組みはゼロ**（本番DB実測・コードベース確認済み: `app/api/cron/` 配下に該当cronなし）。

2026-07-08 の Fable/Codex 双方の分析が独立に「データ整合性の週次監査」を最優先施策として指摘しており、既存の Slack 通知基盤（`lib/llm/notify.ts`）に乗せる形での実装が現実的と判断した。

## スコープ

対象:
- 新規 cron ルート（週次）を新設し、以下5種のチェックを実行して Slack に集計結果を通知する:
  1. 複数試合間の `match_events` 重複検知（署名ベース、`fix-contaminated-match-events.md` の `scripts/cleanup-contaminated-events.ts` と同じ検出ロジックを流用）
  2. `match_events` の合計点と最終スコアの不一致検知（`eventTotalsMatchFinalScore`〈`lib/llm/stages/assemble.ts`〉を流用）
  3. `status='finished'` かつ `match_events` が0件の試合の件数
  4. `match_content` の `draft` 滞留件数（現在119件）と、直近生成分に限定した増加傾向
  5. `competition_standings` の `updated_at` が大会ごとの想定更新頻度（週次）より古い大会の一覧

対象外:
- 検知した問題の自動修正(本 cron は検知・通知のみ。修正は都度 spec 化して個別対応する、これまでの運用を継続)
- 統計捏造の本文レベルの再監査（`tools/audit-entity-grounding.ts` が既に専用ツールとして存在し、LLMコストを伴うため対象外。本 cron は決定的〈非LLM〉チェックのみ）
- Slack 以外の通知チャネル追加

## データモデル変更

なし。

## API サーフェス

新規: `app/api/cron/audit-data-integrity/route.ts`（POST、`assertCronAuthorized` で保護、既存 cron ルートと同じ認可パターン）

## 実装詳細

### 1. cron ルート

`app/api/cron/fill-event-gaps/route.ts` 等の既存構成に倣う（`assertCronAuthorized` → 処理 → `NextResponse.json`）。

### 2. 各チェックの実装

- **重複イベント検知**: `scripts/cleanup-contaminated-events.ts` の署名計算ロジック（`type|minute|player_id` をソートして連結しハッシュ化、同一署名を共有する試合が2件以上かつイベント数4件以上のグループを検出）をそのまま関数として切り出し、cron からも呼べるようにする（重複実装を避ける）
- **スコア不一致検知**: `status='finished'` の試合を対象に `eventTotalsMatchFinalScore` を実行し、不一致件数を集計
- **イベント0件の finished 試合**: 単純な SQL カウント
- **draft 滞留**: `match_content` で `status='draft'` の件数と、直近7日以内に生成された draft の件数を分けて集計
- **順位表の鮮度**: `competition_standings` を `competition_id` でグルーピングし、`MAX(updated_at)` が7日以上前の大会をリストアップ（進行中シーズンのみ対象、終了済み大会は除外する条件を入れる）

### 3. Slack通知

`lib/llm/notify.ts` に新しい関数 `notifyDataIntegrityReport` を追加し、上記5項目の集計結果を1つのメッセージにまとめて送信する。既存の `postToSlack` 内部関数をそのまま再利用する。

### 4. GitHub Actions ワークフロー

`.github/workflows/cron-ingest-standings.yml` と同じ構成で `.github/workflows/cron-audit-data-integrity.yml` を新設する。スケジュールは週次（既存の順位表更新cronと重ならない曜日・時刻を選ぶ。例: 日曜3:30）。

## LLM 連携

なし（決定的チェックのみ、LLM呼び出しゼロ）。

## 受け入れ条件

1. `workflow_dispatch` で手動実行した場合、5項目それぞれの集計結果が返る
2. 意図的に重複イベントを持つテストデータ（または既存のテストフィクスチャ）で、重複検知が正しく機能する
3. スコア不一致・イベント0件・draft滞留・順位表鮮度の各チェックが、それぞれ独立したユニットテストでカバーされている
4. Slack通知が1回にまとまり、5項目全ての結果を含む（Slack webhook未設定時は`console.warn`のみで失敗しない、既存パターンを踏襲）
5. 新規cronは既存のcron認可（`assertCronAuthorized`）で保護されている
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- 順位表鮮度チェックの「進行中シーズンのみ対象」の判定方法（`competitions.end_date` が未来かどうか等）は実装時に既存の類似判定ロジックを参考にしてよいか確認してほしい
- 通知の閾値（例: draft滞留が何件を超えたら「異常」とみなすか）は初期値をCodexの裁量で決めてよいが、運用開始後にOwnerが調整する前提とする
