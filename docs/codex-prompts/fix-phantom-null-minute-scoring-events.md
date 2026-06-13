# Codex プロンプト: 幽霊 null-minute 得点イベントの除去

仕様: `specs/fix-phantom-null-minute-scoring-events.md` を参照（内容はインライン展開しない）。

## タスク

イベント由来の得点が最終スコアを上回る「過剰計上」の原因＝`minute IS NULL` の幽霊得点イベント（多くは重複コンバージョン）を、**チーム単位の厳密な再計算で和合する場合のみ**除去する。2つの成果物:

1. 一回限りのクリーンアップスクリプト（既存データ修正、段階適用）
2. ライブ取り込み時の予防ガード（再混入を止める）

データ修正系のため、誤削除ゼロを最優先する。和合しないものは絶対に消さない。

## 共通: 再計算（reconciliation）純関数

まず両成果物が使う純関数を実装し、単体テストを付ける。

- 点数換算: `try=5, conversion=2, penalty_goal=3, drop_goal=3`（penalty try は既存 `isPenaltyTry` の扱いを踏襲。点数定義は変えない）
- 入力: あるチームの得点イベント配列＋そのチームの実スコア
- ロジック:
  1. `implied_team = Σ 点数`
  2. `implied_team <= actual` → 削除なし（`{ remove: [], status: "ok" }`）
  3. `implied_team > actual` → `minute === null` の得点イベント部分集合のうち、**除去後に `implied_team === actual` を厳密一致**させるものを探す
     - 一意に決まる → `{ remove: [...events], status: "reconciled" }`
     - 存在しない/非一意 → `{ remove: [], status: "needs_review" }`
- **必ずチーム単位**（home/away を別々に判定）。試合合計では判定しない（誤差相殺で誤動作する）

配置: `lib/ingestion/reconcile-phantom-events.ts`（新規・export）。テスト: `tests/ingestion/reconcile-phantom-events.test.ts`。

### 必須テストケース

- 単一の null-minute conversion で和合（Crusaders 14→12）→ `reconciled`、その1件のみ remove
- 候補が複数あり一意に決まらない → `needs_review`、remove は空
- undercount（implied < actual）→ `ok`、remove 空
- penalty try を含み、null-minute 幽霊が別にある → penalty try を誤って消さない
- null-minute だが和合しない overcount → `needs_review`、remove 空（**誤削除しないことの保証**）

## 成果物1: クリーンアップスクリプト

`scripts/cleanup-phantom-null-minute-events.ts` を新設。

- 引数: `--family <slug>` / `--season <s>`（絞り込み。**段階適用のため必須運用**）、`--confirm-owner-approved`（無ければ dry-run）
- 対象: `status='finished'` かつ `home_score`/`away_score` 非 NULL の試合（引数で絞った範囲）
- 各試合の home/away に再計算純関数を適用
- dry-run（デフォルト）: 削除せず、以下を出力
  - 削除対象: 試合・チーム・除去イベントID・before/after implied
  - `needs_review`: 一意に和合しない overcount 試合の一覧
- `--confirm-owner-approved` 時のみ実 DELETE
- 起動: `node --env-file=.env.production.local tools/run-ts.cjs scripts/cleanup-phantom-null-minute-events.ts --family super-rugby-pacific --season 2026`

**段階適用**: SRP 2026 を先に dry-run→実行し overcount 20件解消を確認してから全大会。スクリプト側で一括実行を強制しないこと。

## 成果物2: 取り込み時ガード

`lib/ingestion/live-ingest.ts` の得点イベント upsert 直前で、当該試合の home/away に再計算純関数を適用し、`remove` 対象（status=`reconciled`）の null-minute イベントを保存対象から除外する。除外時は件数を `console.warn("[phantom-events] dropped", { matchId, count })` で記録。`needs_review` はそのまま保存し、既存の整合性ログ（`fix-score-event-integrity-check`）に委ねる。

## 受け入れ条件（完了の定義）

- ビルド・typecheck・lint 緑、既存テスト緑
- 再計算純関数の単体テスト（上記5ケース）が通る
- dry-run（`--family super-rugby-pacific --season 2026`）で overcount 20試合が `reconciled` または `needs_review` として漏れなく列挙される
- `--confirm-owner-approved` 実行後、SRP 2026 で「team の implied > actual」の試合が 0 になる（`needs_review` 明示分を除く）
- `implied === actual` を厳密復元できない試合は1件も DELETE されない
- Chiefs 49-12 Crusaders（`a74192a1-4...`）でクリーンアップ後 Crusaders 合計が 12
- 取り込みガード適用後、新規取り込み試合で和合可能な null-minute 幽霊が保存されない

## エッジケース・注意事項

- **本番 DB への DELETE は Owner が実行**。Codex はスクリプトとガードの実装・テストまで。`--confirm-owner-approved` 無しでは絶対に削除しない
- penalty try の点数（現状ロジック）を変更しない。本 spec は重複イベント除去のみ
- `match_events.team_id` が NULL の得点イベントがあれば、そのチームの再計算からは除外しつつ `needs_review` 扱いにする（チーム判定不能なら消さない）
- 取り込みガードは `reconciled`（厳密和合）のみ除外。少しでも曖昧なら保存して検知ログに回す

## 参考パターン

- ライブ取り込みの events upsert 形式は `lib/ingestion/live-ingest.ts` の既存実装を参照
- 本番スクリプトの起動・env 読み込みは `tools/run-ts.cjs` と既存 `scripts/*.ts` を参照
- 点数換算・イベント型は `lib/scrapers/wikipedia-match-events.ts` の型定義を参照
