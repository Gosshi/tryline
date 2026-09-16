# Codex 指示書: recap バッチ枠の占有を解く

仕様: `specs/fix-recap-batch-starvation.md`（権威。ここに書いていない判断は仕様書に従う）

## 問題

recap のバッチ10枠のうち9枠が「イベントが無く絶対に生成できない試合」に消費され、**1回の実行で1本しか recap が作れていない**。本番実測で、候補98件のうち36件が生成不能、62件が生成可能なまま滞留している。

`lib/cron/orchestrate.ts` の `runOrchestrate` は `recapCandidates.eligibleMatches.slice(0, RECAP_BATCH_SIZE)` で先頭10件を取るだけで、イベントの有無を見ていない。生成不能な試合は recap が作られないので候補の先頭に居座り続ける。

## やること

`recapCandidates` を得た後、`slice(0, RECAP_BATCH_SIZE)` の**前**に判定を挟む。

1. 候補の先頭 `RECAP_EVENT_LOOKUP_CANDIDATES` 件（新規定数、60）を対象に `match_events` から `select("match_id").in("match_id", 対象id)` を引く
2. その集合に含まれる試合だけを残し、先頭 `RECAP_BATCH_SIZE` 件をバッチにする
3. 除外した試合を保持し、Discord 通知に「候補から除外（イベント未取得）: N件」＋リンクを追加する（**除外0件のときは行を出さない**）

**`match_events!left(id)` + `.is("match_events.id", null)` は使わないこと。** PostgREST では `!left` 埋め込みへのフィルタが親行を絞らず、同じ書き方で3経路が沈黙していた（PR #842 で修正済み）。

## 壊してはいけないもの

- **`p3-recap-require-events.md` のガード**（イベント0件なら LLM を呼ばず `status: "skipped"`）。多層防御として残す
- **既存の「バッチ内スキップ」報告の意味**。`RecapSkipReport` の `skippedCount` / `matches` / `理由別` は、バッチ内で生成を試みてスキップされた件数のまま。除外分は**別の行**として足す
- `getMatchIdsMissingContent` の `skippedCount`（＝既にコンテンツがある試合の数）と、今回の除外数を**混同しない**
- preview の候補選定（`previewCandidates`）
- イベントを持つがスコア不整合の試合は**従来どおりバッチに入れる**（`score_mismatch` として報告される）

## 既存テスト

`tests/cron/orchestrate.test.ts` の次の6本を通し続けること。必要なら期待値を更新してよいが、**報告の意味を変えない**こと。

- `processes missing recaps from newest finished matches first`
- `counts recap skips when the recap-skip notifier is unset`
- `reports all events-unavailable recap skips once per batch`
- `does not report recap skips when no recap is skipped`
- `reports only the events-unavailable recap skips in a mixed batch`
- `returns the orchestration result when recap-skip notification fails`

## 完了の定義

仕様書の受け入れ条件1〜9。特に次を省略しない。

- **AC2**: 候補の先頭が全てイベント0件でも、後続のイベントを持つ試合まで到達して枠を埋めること。**除外前に `slice` する実装だとここが0件になって落ちる。**
- **AC8（意図的破壊）**: 除外処理を外す、または除外前に `slice` すると、AC1・AC2 のテストが**実際に落ちる**ことを確認し、結果を PR 本文に書く。

受け入れ条件10（本番実行での確認）は **Owner 承認が必要なので Codex 側では実行しない**。PR 本文に「未実施」と明記すること。

## 検証コマンド

```
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test` のテスト総数が 311 files / 1,906 tests から減っていないことを PR 本文に書くこと。

## 依存

追加パッケージなし。マイグレーションなし。本番DBへの書き込みなし。
