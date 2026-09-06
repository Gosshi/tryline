**この指示書は無効です（2026-09-06）。実装しないでください。**

PR #770（`d6a2c21`）のマージにより、対応する仕様書の目的は追加実装なしで満たされました。不整合時は `hasEvents === false` となり、QA の得点者一覧作成と選手別統計の照合の両方が実行されません。

詳細は `specs/fix-stats-exclude-unverified-events.md` の冒頭を読んでください。

---

仕様書 `specs/fix-stats-exclude-unverified-events.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**QA が汚染イベントから作った基準値で、本文を照合しています。**

`lib/stats/player-stats.ts` の `buildPlayerStatsFromEvents` は渡されたイベントをそのまま集計し、**整合検証を一切していません。** 呼び出し元は `lib/llm/stages/qa.ts:341` と `:440` で、**本文の選手別得点を照合するための基準値**として使っています。

基準値が汚染イベントから作られると、**照合そのものが無意味になります。** 別試合のイベントが入っていれば、QA は「別試合の得点者リスト」と本文を突き合わせ、一致すれば通し、正しい本文を減点します。

**`lib/llm/sourced-facts/derive-team-stats.ts` は対象外です（2026-09-06 訂正）。** 同関数は `match_events` を一度も参照せず、sourced facts とチーム名から統計を導きます。イベント整合とは無関係でした。初版の指示が誤りです。

## 既存のゲートが届いていない場所です

`fix-derived-stats-event-integrity-gate.md`（実装済み）は `assemble.ts` の `derived_stats` に、`fix-generation-event-integrity-gate.md`（未実装）は `score_timeline` と `match_events` にゲートを掛けます。

**どちらも `lib/stats/player-stats.ts` を対象にしていません。**

## 触るファイル

```
lib/llm/stages/qa.ts
lib/llm/prompts/qa-content.ts   （PROMPT_VERSION のバンプ）
```

**前提: `fix-generation-event-integrity-gate` が先にマージされていること。** 未マージなら実装せず Owner に確認してください。

**`lib/stats/player-stats.ts` に差分を作らないでください。** 純関数のまま維持し、**呼び出し側で入力を絞ります。**

## 判定を再計算しないでください

**QA 層では判定できません。** `AssembledContentInput["match_events"]`（`lib/llm/types.ts:213-219`）は `team_name` を持ち **`team_id` を持ちません**。`computeEventPointTotals` は `teamId` を要求します。

`fix-generation-event-integrity-gate` が `assemble` で算出する **`eventIntegrity` を読むだけ**にしてください。第三チームの判定も上流に委ねます。

## 混同してはいけないこと

**「照合しない」と「照合して一致した」を同じ扱いにしないでください。**

前者は検証が行われていない状態で、`factual_grounding` を満点にする根拠になりません。`issues` に照合できなかった旨を記録してください。

## テスト

**`pnpm test` だけを完了根拠にしないでください。** `exclude` が `tests/llm/pipeline.test.ts` と `tests/llm/stages/assemble.test.ts` を実行しません。除外外の新規ファイルに置き、**実行結果を PR 本文に貼ってください。**

**正常系を必ず入れてください。** 整合している試合で従来どおり照合が行われ、採点結果が変わらないこと。
