# feat-backfill-reparse-existing-urc-events

## 背景

[`fix-urc-rc-kicker-section-events`](./fix-urc-rc-kicker-section-events.md)（PR #424）でパーサが URC の `Con:`/`Pen:` 集約形式を正しく拾えるようになった。しかし **既に finished の URC 試合は古い（undercount の）イベントのまま**で、新パーサが自動適用されない:

- **ライブ cron**（`ingestLiveCompetition`）は `statusChangedToFinished`（scheduled→finished に変化した試合）だけイベント生成 → 既存 finished 試合は再処理しない
- **backfill**（`scripts/backfill-urc-match-events.ts`）は `match_events.length === 0`（イベント皆無）の試合だけ対象 → トライがある undercount 試合は除外（2026-06-13 dry-run で target=0 を確認）

→ 既存 finished URC 試合を**新パーサで再パース**する手段が無い。本 spec でそれを足す。

## スコープ

対象:
- `scripts/backfill-urc-match-events.ts` に **`--reparse-existing` フラグ**を追加し、対象選定の `match_events.length === 0` 条件をスキップして **finished URC 試合を全件（wikipedia_url を持つもの）再パース**できるようにする

対象外:
- RC 2025（生HTML未保存・シード由来。別経路で再シード）
- SRP の overcount（[`fix-phantom-null-minute-scoring-events`](./fix-phantom-null-minute-scoring-events.md) のクリーンアップで別途）
- 他大会への一般化（必要になったら別途）

## データモデル変更

なし。`upsertMatchEvents` は match 単位で **delete→insert**（`lib/ingestion/events.ts`）で冪等なので、再パースしても二重計上は起きない。

## 変更詳細

`scripts/backfill-urc-match-events.ts`:

1. `parseOptions` に `--reparse-existing`（boolean, default false）を追加し `CliOptions` に持たせる
2. `loadTargetMatches`（L181-184 のフィルタ）を条件付きに:
   - `reparseExisting === false`（既定）: 現状どおり `match_events.length === 0 && getWikipediaSource !== null`
   - `reparseExisting === true`: `getWikipediaSource(external_ids) !== null` のみ（イベント有無を問わない）
3. ログ文言（"Target finished URC matches without events: N"）を、フラグ時は "…(reparse-existing) N" 等に分岐
4. `--reparse-existing` 単独では dry-run を強制せず、書き込みは従来どおり `--confirm-owner-approved` 必須

## 受け入れ条件

1. `--reparse-existing --dry-run --season=2025-26` で target が 0 より大（wikipedia_url を持つ finished URC 試合数）になる
2. フラグ無しの挙動は不変（target は events 皆無の試合のみ）
3. `--reparse-existing --confirm-owner-approved --season=2025-26` 実行後、URC 2025-26 の undercount（team の implied < actual）試合が **79 → 一桁**に減る
4. 再実行しても二重計上にならない（冪等。delete→insert を確認）
5. lint・typecheck・既存テスト緑。`parseOptions` のフラグ解釈に単体テスト追加

## 運用（Owner 実行）

```
# 同期（#424 後の origin）
git fetch origin && git reset --hard origin/main
# dry-run
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/backfill-urc-match-events.ts --season=2025-26 --reparse-existing --dry-run
# 本実行
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/backfill-urc-match-events.ts --season=2025-26 --reparse-existing --confirm-owner-approved
```

実行後、本番 SQL で undercount 件数を検証する（79→一桁）。

## 未解決の質問

- ノックアウト試合は別問題（`fix-urc-knockout-parser` 系）で events 0 のまま残りうる。本 spec では扱わない
- 再パースで万一マッチング誤り（チーム名照合）が起きないか、dry-run のログで件数・対象を目視確認してから本実行する
