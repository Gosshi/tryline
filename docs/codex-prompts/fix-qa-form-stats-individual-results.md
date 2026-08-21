# Codex 指示: QA に直近5試合の個別スコアを渡し、正しい記述が減点される問題を直す

## 仕様書

`specs/fix-qa-form-stats-individual-results.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が問題か（一文）

QA に渡っている直近フォームは**集計値だけ**（勝率・平均得点・戦績）なので、本文が「ウェールズに43-0」のように**個別の対戦相手とスコア**を書くと、QA から見て裏づけが存在せず `factual_grounding` が下がる。

## 実際に起きたこと（2026-08-21、本番生成）

南アフリカ vs ニュージーランド第1テストのプレビューが reject され、指摘がこれ。

```
直近5試合の対戦相手・スコアや8月22日という日付は、提示された許可済み事実には含まれていません
```

**本文の 10 件のスコアを本番 DB で全件照合したところ、10 件すべて完全一致した。**

```
SA  43-0 ウェールズ / 42-28 スコットランド / 45-21 イングランド / 73-0 ウェールズ / 24-13 アイルランド
NZ  47-17 イタリア / 40-21 アイルランド / 38-21 ストーマーズ / 54-0 シャークス / 50-19 ブルズ
```

**捏造ではない。QA の過検出。**（同じ指摘の「8月22日」は本当に誤りだが、別 spec `fix-narrative-kickoff-date-utc-leak.md` の担当。**こちらでは触らない。**）

## これは 2 度目である

`fix-qa-prompt-missing-form-and-match-metadata.md`（commit `4727c15`、マージ済み）が同種の過検出を既に直している。**そのとき QA に渡したのは集計値だけだった。**

```ts
// lib/llm/prompts/qa-content.ts:13-18 — 現状
export type TeamFormStats = {
  avg_points_against_last_5?: number | null;
  avg_points_for_last_5?: number | null;
  record_last_5?: string | null;
  win_rate_last_5: number | null;
};
```

**「平均45.4点」は検証できるが「ウェールズに43-0」は検証できない。**

前身 spec が指摘した「生成側は持っているが判定側からは見えない」非対称が、**一段深いところで残っている。**

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/llm/prompts/qa-content.ts:13-18` | `TeamFormStats`。集計値 4 つだけ |
| 同 `:185-192` | `formStatsBlock`。**踏襲する形式。ここに並べて新ブロックを足す** |
| 同 `:11` | `PROMPT_VERSION`（現在 `qa@2.6.0`）。上げる |
| `lib/llm/stages/assemble.ts` の `recent_form` | **型と構造をここに揃える。名前を発明しない** |
| `lib/llm/prompts/generate-preview.ts:158` | 生成側が `recent_form` の個別スコアを使うよう指示している証拠 |
| `lib/llm/pipeline.ts` の QA 呼び出し | `matchContext` 構築箇所。配線先 |
| `specs/fix-qa-prompt-missing-form-and-match-metadata.md` | 前身 spec。**同じ轍を踏まないため受け入れ条件 5 を読むこと** |

## やること

1. `QaMatchContext` に直近5試合の個別結果を追加する（対戦相手名・自チーム得点・相手得点・home/away）
2. `formStatsBlock` と同形式のブロックとして出力する。**既存の `formStatsBlock` は残す**
3. `pipeline.ts` で配線する。**値の出どころは生成側と同一**（`assembled.recent_form` をそのまま渡す）
4. `PROMPT_VERSION` を上げる

## 設計上の注意（前身 spec が明示的に警告している点）

**QA 用に DB を引き直さないこと。** 生成プロンプトが見ている `assembled.recent_form` をそのまま QA にも渡す。別経路で取ると「生成側と判定側が別の入力を見る」構造が三度目の再発をする。

**対戦相手名は日本語表記であること。** 本文は `name_ja`（「ウェールズ」「ストーマーズ」）で書く。`recent_form` が英語名しか持っていない場合、照合できず本修正の効果が出ない。**実データで確認してから進めること。** 英語名だった場合は `japanese_name_glossary` の経路を調べ、PR 本文でどう解決したか報告すること。

## 絶対にやってはいけないこと

1. **既存の集計値を削除・改名しない。** 前身 spec の結果を維持する。集計値と個別結果は別の記述を裏づける
2. **プログラム側ガード（`containsUnsupportedStatistic`）を変えない。** `fix-qa-win-rate-false-positive.md` と `fix-qa-team-stats-new-fields-unsupported.md` のテストが通ること
3. **採点ルーブリックの閾値を変えない**
4. **sourced_facts 0 件時の指示文（`qa-content.ts:111-114`）を消さない。** この指示自体は正しい
5. **生成プロンプトに触らない。** 本件は QA 側だけ
6. **日付の UTC ずれに手を出さない。** 別 spec
7. **h2h・順位表・ラインアップを QA へ配線しない。** 落ちた実例がまだ無い。憶測で広げない
8. **コンテンツを再生成しない**
9. **モデル ID を直書きしない。** `lib/llm/models.ts` の定数を使う

## テストで押さえる点

- `buildQaContentPrompt` の出力に対戦相手名とスコアが現れる
- **修正前は個別スコアが一切出力されていないことを固定するテストを置く**
- 値が空・未指定 → ブロックが出力されない
- 既存 `formStatsBlock`（集計値）が引き続き出力される
- 配線の出どころが生成側と同一であることをテストで担保する（前身 spec 受け入れ条件 5 と同じ要求）
- 上記 10 件のスコアを含む本文で、個別スコアがブロックに現れる。**LLM の採点結果そのものは非決定的なのでテスト対象にしない**

## 完了の定義

- `specs/fix-qa-form-stats-individual-results.md` の受け入れ条件 1〜11 を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が green
- **再生成は未実施**（受け入れ条件 12）
- PR 本文に、`recent_form` の実データ構造（対戦相手名が日本語か英語か）と、QA プロンプトに実際に出力される新ブロックの全文を貼ること
