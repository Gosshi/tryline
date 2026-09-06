# fix-stats-exclude-unverified-events

> **解決済み・実装不要（2026-09-06）。** `specs/fix-generation-event-integrity-gate.md`（PR #770、`d6a2c21`）のマージにより、本 spec の目的は追加実装なしで満たされた。**この spec に対する実装 PR を作らないこと。**
>
> ### 検証結果（2026-09-06、`d6a2c21` で確認）
>
> | 経路 | 確認 |
> |---|---|
> | `pipeline.ts:260` | `hasEvents = assembled.match_events.length > 0` |
> | `assemble.ts:1142` | 不整合時に `match_events` を空配列にする（#770） |
> | `pipeline.ts` の QA 呼び出し | 同じ配列を `matchEvents` として渡す |
> | `qa.ts:692-693` | `buildPlayerStatPromptNames` は `hasEvents` が true のときだけ呼ばれる |
> | `qa.ts:436, 440` | `buildPlayerStatsFromEvents` は `hasEvents` が true のときだけ呼ばれる |
>
> **不整合時は `hasEvents === false` となり、プロンプト用の得点者一覧作成と選手別統計の照合の両方が実行されない。** QA 側の再計算も追加配線も不要。
>
> ### 初版の誤り 2 件（記録）
>
> 1. **`lib/llm/sourced-facts/derive-team-stats.ts` を対象に含めた。** 同関数は `match_events` を一度も参照せず、イベント整合とは無関係だった
> 2. **「QA が上流の `eventIntegrity` を読む」とした。** `evaluateNarrativeQuality` に `eventIntegrity` は渡っておらず、`AssembledContentInput["match_events"]` は `team_id` を持たないため QA 層では判定を再計算できない
>
> どちらも Codex が着手前に指摘した。**対象関数の引数と、呼び出し側が何を渡しているかの両方を開いてからスコープを決めること。**
>
> ### 未解決として残るもの
>
> **表示側の選手ページ・チームページの通算統計**は本 spec でも #770 でも扱っていない。同じイベントから集計している可能性があり、別途調査が必要。**「統計から汚染を除外した」と完了扱いにしないこと。**

---

## 背景

2026-09-05 の監査（`docs/audits/gpt6-spec-review-and-skill-update-2026-09-05/review.md` A-12）で、**元記録を直しても二次集計に汚染が残る**ことが指摘された。

> チーム/選手統計から未検証 event を除外する。元記録だけ直して集計を残さない。

現状を確認した（2026-09-06、`a8509c1`）。

`lib/stats/player-stats.ts` の `buildPlayerStatsFromEvents` は、渡されたイベントをそのまま集計する。**整合検証は一切していない。**

```
grep -n 'eventTotalsMatchFinalScore\|event-integrity' lib/stats/player-stats.ts
→ 該当なし
```

呼び出し元は `lib/llm/stages/qa.ts:341` と `:440` で、**QA が本文の選手別得点を照合するための基準値**として使っている。

**基準値が汚染イベントから作られると、照合そのものが無意味になる。** 豪州第2戦（`f01f68e2-…`）のように別試合のイベントが入っている場合、QA は「別試合の得点者リスト」と本文を突き合わせ、一致すれば通し、一致しなければ正しい本文を減点する。

**`lib/llm/sourced-facts/derive-team-stats.ts` は本 spec の対象外である**（2026-09-06 訂正）。同関数は `deriveTeamStatsFromSourcedFacts(sourcedFacts, homeTeamNames, awayTeamNames)` という署名で、**`match_events` を一度も参照しない**。sourced facts とチーム名から統計を導くもので、イベント整合とは無関係。初版で対象に含めていたのは誤りだった。

### 既存のゲートとの関係

`fix-derived-stats-event-integrity-gate.md`（2026-06、実装済み）は `assemble.ts` の `derived_stats` にゲートを掛けた。`fix-generation-event-integrity-gate.md`（未実装）は `score_timeline` と `match_events` まで広げる。

**どちらも `lib/stats/player-stats.ts` を対象にしていない。** 本 spec がその穴を埋める。

## スコープ

**前提: `specs/fix-generation-event-integrity-gate.md` が先にマージされていること。**

`AssembledContentInput["match_events"]`（`lib/llm/types.ts:213-219`）は `team_name` を持ち **`team_id` を持たない**。一方 `computeEventPointTotals` は `teamId` を要求するため、**QA 層では判定を再計算できない。**

`fix-generation-event-integrity-gate.md` が `assemble` の段階で判定し、結果を `eventIntegrity`（判定・元イベント数・期待値・実測値・差分・理由）として内部に保持する。**本 spec はそれを読むだけにする。**

対象:
- `lib/llm/stages/qa.ts`: 上流から渡された `eventIntegrity` を読み、不整合なら選手別統計の照合を行わない

対象外:
- **`lib/llm/sourced-facts/derive-team-stats.ts`**（`match_events` を使わないため無関係。初版の誤り）
- **判定の再計算**（上流の `eventIntegrity` を読むだけ。`assemble.ts` の配線は `fix-generation-event-integrity-gate.md` の範囲）
- `lib/stats/player-stats.ts` **本体の変更**（純関数のまま維持する。呼び出し側で入力を絞る）
- イベントデータの修正・削除
- 表示側の選手ページ・チームページ（`fix-contaminated-events-display-isolation.md` の範囲外だが、本 spec でも扱わない。別途）
- QA の採点ルーブリック・閾値の変更

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

**LLM 呼び出しは増えない。** QA プロンプトに渡す情報が減る場合がある（不整合時に選手別統計を渡さない）。

**プロンプトの分岐が変わるため、`lib/llm/prompts/qa-content.ts` の `PROMPT_VERSION` をバンプする。**

## 変更詳細

**判定を再計算しないこと。** `fix-generation-event-integrity-gate.md` が `assemble` で算出した `eventIntegrity` を読む。

**第三チームの判定は QA では行えない。** `match_events` に `team_id` が無いためで、判定は上流に委ねる。

**`eventIntegrity` が「不整合」または「判定不能」のとき、選手別統計の照合を行わない。** QA プロンプトからその節を落とし、「照合できなかった」ことを `issues` に記録する。

**「照合しない」と「照合して一致した」を同じ扱いにしないこと。** 前者は検証が行われていない状態であり、`factual_grounding` を満点にする根拠にならない。

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts` の `exclude` により `tests/llm/pipeline.test.ts` / `tests/llm/stages/assemble.test.ts` を実行しない。除外されていない新規ファイルに置くか、除外を外した実行コマンドを用意し、**PR 本文に実行コマンドと結果を貼ること。**

1. イベント合計が最終スコアと不一致の試合で、QA が選手別統計の照合を行わないことを検証するテストがある
2. 同ケースで `issues` に照合できなかった旨が記録されることを検証するテストがある
3. 同ケースで `factual_grounding` が自動的に満点にならないことを検証するテストがある
4. **正常系**: 整合している試合では従来どおり照合が行われ、採点結果が変わらないことを検証するテストがある
5. `eventIntegrity` が「判定不能」の場合も照合を行わず、**不整合とは別の理由**で記録されることを検証するテストがある
6. `lib/stats/player-stats.ts` に差分が無い（純関数のまま）
7. `lib/llm/sourced-facts/derive-team-stats.ts` に差分が無い
8. QA 内で整合判定を再計算していない（上流の `eventIntegrity` を読んでいる）
9. `lib/llm/prompts/qa-content.ts` の `PROMPT_VERSION` がバンプされている
10. `pnpm typecheck` が green

## 未解決の質問

なし。

**本 spec で解決しないこと**: **選手ページ・チームページの通算統計**も同じイベントから作られている可能性がある。本 spec は QA と derive-team-stats に限定しており、表示側の集計は調べていない。**「統計から汚染を除外した」と完了報告しないこと。** 表示側の調査は別途行う。
