# fix-phantom-null-minute-scoring-events

## 背景

得点推移グラフ・タイムラインを差別化機能として訴求しているのに、一部の試合でイベント由来の合計得点が最終スコアを上回る「過剰計上（overcount）」が存在する。

本番DB調査（2026-06-13）で原因を特定した。これは試合間のイベント混線（汚染）ではなく、**`minute = null` の幽霊得点イベント**（多くは重複コンバージョン）が混入する決定的なパーサ起因のバグである。

### 実証データ

Super Rugby Pacific 2026（finished 81試合）で overcount は 20試合。その **20試合すべて（20/20）が `minute IS NULL` の得点イベントを持つ**。

代表例 — 準決勝 Chiefs 49-12 Crusaders（match_id `a74192a1-77f5-49b4-abdc-9ebc8b1d398f`）:
- Chiefs: 7トライ + 7G = 49 → 正確
- Crusaders: 2トライ + **2**コンバージョン = 14（実際は12）。うち1件が `minute: null` の幽霊コンバージョン
- この `minute: null` の1件を除けば 12 == 12 で完全一致する

### 根因（パーサ）

`lib/scrapers/wikipedia-match-events.ts` の `parseMinutes()`（L65-70）は、分テキストが取れない場合に `[null]` を返す。Wikipedia の得点セルで、コンバージョンの記法が分を伴わない / 直前のトライと同じ kicker が別ブロックとして現れる等のケースで、分なしの余分なイベントが1件生成され、`flush()` がそのまま push する。結果、当該チームのイベント合計がそのチームの実スコアを超える。

過剰計上の差分は小さく（SRP 2026 では +2〜+8、大半が +2）、recap の publish 自体はブロックされていない（叙述には実害が小さい）。ただし得点推移・派生スタッツの正確性を損なうため、差別化機能の信頼性として看過できない。

関連: 既存 spec [`fix-score-event-integrity-check`](./fix-score-event-integrity-check.md) は recap パイプラインで不整合を**検知・ログ**するのみ。[`fix-derived-stats-event-integrity-gate`](./fix-derived-stats-event-integrity-gate.md) は不正確な派生スタッツの**算出を抑制（ゲート）**するのみで、両者とも「イベントデータ自体の修正は対象外」と明記している。本 spec はその補完として、データクリーンアップと取り込み時の予防を担う。

## スコープ

対象:
- 既存データのクリーンアップ（全大会・全シーズン）: `minute IS NULL` の幽霊得点イベントを、**チーム単位で完全一致による再計算ができる場合のみ**削除する一回限りのスクリプト
- 取り込み時の予防: ライブ取り込みの得点イベント保存経路（`lib/ingestion/live-ingest.ts` 周辺）で、保存前に同じチーム単位の再計算ガードを適用し、和合する `minute IS NULL` イベントを除外する

対象外:
- イベント欠落（undercount）の補完 — 別問題（URC/RC のイベント取り込みギャップ）。本 spec では一切扱わない
- `minute IS NULL` だが正当な得点イベント（再計算で和合しないもの）の削除 — 削除せず、レポートに「要手動確認」として列挙するに留める
- recap の再生成 — 本 spec の範囲外（Owner が別途、対象試合を試し焼き手順で再生成）
- パーサ `parseMinutes` 自体のロジック変更 — 分を取れないケースの根本対処は別 spec 候補（まずは保存時ガードで止血する）

## データモデル変更

なし（`match_events` から行を DELETE するのみ。スキーマ変更なし）。

## API サーフェス

なし。

## UI サーフェス

なし（データが正確化されることで既存の得点推移グラフ・派生スタッツが自動的に正しくなる）。

## LLM 連携

なし（LLM 呼び出しゼロ。コスト影響なし）。

## 修正詳細

### 再計算（reconciliation）アルゴリズム — クリーンアップ・予防で共通

得点イベントの点数換算: `try=5, conversion=2, penalty_goal=3, drop_goal=3`（penalty try の扱いは現状の `isPenaltyTry` ロジックを踏襲。本 spec で点数定義は変更しない）。

ある finished 試合・あるチーム（home / away それぞれ）について:

1. そのチームのイベント点数合計 `implied_team` を計算する
2. `implied_team <= actual_team_score` なら何もしない（overcount ではない）
3. `implied_team > actual_team_score` のとき、そのチームの `minute IS NULL` の得点イベント集合から、**削除後に `implied_team == actual_team_score` を厳密に満たす部分集合**を探す
   - 厳密一致する部分集合が一意に決まる場合のみ、その集合を削除対象とする
   - 一致する部分集合が存在しない / 複数あって一意に決まらない場合は **削除せず**、「要手動確認」としてレポート出力する

ポイント: `match_events.team_id` と `matches.home_score` / `away_score` を使い、**必ずチーム単位で**判定する（試合合計での判定は、両チームの誤差が相殺して見逃す/誤削除するため不可）。

### 1. クリーンアップスクリプト

`scripts/cleanup-phantom-null-minute-events.ts` を新設する。

- 全 finished 試合（`home_score`/`away_score` が非 NULL）を走査
- 上記アルゴリズムで削除対象を決定
- **デフォルトは dry-run**（削除せず、対象一覧と件数のみ出力）
- `--confirm-owner-approved` フラグがある場合のみ実 DELETE を実行
- 出力レポート:
  - 削除対象（試合・チーム・除去イベント・before/after の implied）
  - 「要手動確認」（一意に和合しない overcount 試合）
- 起動は本番 env で `node --env-file=.env.production.local tools/run-ts.cjs scripts/cleanup-phantom-null-minute-events.ts`

### 2. 取り込み時ガード

ライブ取り込みの得点イベント保存経路（`lib/ingestion/live-ingest.ts` の events upsert 直前）で、当該試合の home/away それぞれに同じ再計算アルゴリズムを適用し、和合する `minute IS NULL` 幽霊イベントを保存対象から除外する。除外したら `console.warn` で件数を記録する。和合しない overcount はそのまま保存し、既存の整合性チェック（[`fix-score-event-integrity-check`](./fix-score-event-integrity-check.md)）のログに委ねる。

## 受け入れ条件

1. dry-run 実行時、SRP 2026 の overcount 20試合が削除対象または「要手動確認」として漏れなく列挙される
2. `--confirm-owner-approved` 実行後、SRP 2026 で「implied(team) > actual(team)」の試合が 0 になる（または「要手動確認」として明示的に残った試合のみが残る）
3. クリーンアップで、`implied_team == actual_team_score` を厳密一致で復元できない試合は**1件も削除されない**（誤削除ゼロ）
4. 取り込みガード適用後、新規に取り込まれる SRP/その他ライブ大会の試合で、和合可能な `minute IS NULL` 幽霊イベントが `match_events` に保存されない
5. Chiefs 49-12 Crusaders（`a74192a1-...`）で、クリーンアップ後の Crusaders イベント合計が 12 と一致する
6. ユニットテスト: 再計算アルゴリズムに対し「単一幽霊で和合」「複数候補で非一意 → 手動確認」「undercount → 無変更」「penalty try を含む → 誤削除しない」の各ケース
7. 既存の lint / typecheck / テストが緑

## 決定事項

- **クリーンアップは段階適用**（Owner 決定 2026-06-13）。まず `--family super-rugby-pacific --season 2026` 相当で SRP 2026 のみを dry-run → 実行し、overcount 20件が解消することを確認してから、全大会へ広げる。過去の全件 draft 化事故（[project_regen_length_incident]）に鑑み、いきなり全件 DELETE はしない。スクリプトは大会/シーズン絞り込みの引数を受け付けること。

## 未解決の質問

1. 取り込みガードで幽霊を除外した場合、対象試合の既存 recap を再生成するか／そのまま（次回更新時に自然反映）とするか
2. `parseMinutes` が `[null]` を返す根本対処（パーサ修正）を別 spec として切るか
