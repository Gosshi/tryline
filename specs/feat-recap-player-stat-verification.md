# recap の選手別統計主張を match_events と決定的に照合するQAガード

## 背景

2026-07-08 のコンテンツ品質監査で、`match_events` が正しく紐づいている（イベント汚染がない）試合の recap でも、**実在する選手に対して誤った、または完全に架空の統計**が記載されている事例を2件確認した。

- `日本 27-10 イタリア`（match_id: `f56e9ee9-14be-49e3-b47d-c51a29c07593`）: 本文「マツナガは、トライ2本、コンバージョン3本、ペナルティゴール2本と計20点を稼ぎ」。実際の `match_events` はマツナガの得点がトライ**1本**（16分）・コンバージョン3本・PG2本で、正しい合計は17点。本文の主張（2本・3本・2本）を足しても22点で、本文自身の合計（20点）とも矛盾する
- `アルゼンチン 38-47 スコットランド`（match_id: `42bebc1f-9225-452b-9786-9e0a1fbaa34a`）: 本文「試合を決定づけたのはスコットランドのバートンであった。彼はコンバージョンを6回中5回成功させ」。`match_events` に「バートン」という選手は一件も出現しない（実際のキッカーは Jordan 3回・Burke 2回）

これらは人名グラウンディングゲート（PR #467、`lib/llm/stages/verify-entities.ts`）を通過している。同ゲートは「本文中の人名が確定ラインアップ・イベント・sourced facts に存在するか」のみを検証し、**その人物に紐づく数値主張が正しいかは検証していない**。マツナガ・バートンはいずれも（バートンはNC参加国のスコットランド代表チームに実在する可能性が高く、ラインアップ経由でグラウンディングゲートの許可リストに載っていたと推定される）名前としては許可され、統計だけが根拠なく生成された。

`fix-recap-winner-attribution-consistency.md`（PR #478、実装済み）で「テキスト指示だけでは再発防止にならない」という同種の教訓から、QA応答に `statedWinner` フィールドを追加させコード側で `computeActualWinner` と決定的照合する仕組みを導入した実績がある。本 spec は同じパターンを選手別統計に拡張する。

## スコープ

対象:
- QA ステージ（`lib/llm/stages/qa.ts`）の LLM 応答スキーマに、本文中で言及された「選手名＋定量的な得点関連統計（トライ数・コンバージョン数・ペナルティゴール数・合計得点のいずれか）」を構造化して抽出させるフィールドを追加する
- 抽出された主張を `match_events` から `pointsForMatchEvent`（`lib/format/match-event-points.ts`）を使って計算した実際の値と比較し、不一致があれば `applyDeterministicQaGuards`（既存の `statedWinner` 検証と同じ関数）内で issue を追加し `factual_grounding` スコアを下げる

対象外:
- 数値以外の主観的評価（「〜が目立った」「〜が貢献した」等のプレースタイル評価）の検証。定量的な統計主張のみを対象とする
- 人名グラウンディングゲート自体の変更（引き続き人名の実在性のみを担当する。役割分担を維持する）
- sourced_facts の対象大会拡大（Nations Championship 等の国際大会で sourced facts が無効なこと自体が今回の統計捏造の遠因だが、これは別の P2 課題として `project_nc_data_pipeline` メモリに既に記録されている。本 spec はその根本原因を解消するものではなく、防御層を追加するもの）
- QA プロンプトの新規 LLM 呼び出し追加（既存の QA 呼び出しの応答スキーマ拡張のみ。コスト増ゼロ）

## データモデル変更

なし。

## API サーフェス

なし（LLMステージ内部の処理変更のみ）。

## 実装詳細

### 1. QA応答スキーマの拡張（`lib/llm/stages/qa.ts`）

`statedWinner` と同じ扱いで、新しいフィールドを `ParsedQaResponse` / `QaStageResponse` に追加する:

```ts
type StatedPlayerStatClaim = {
  playerName: string;
  tries?: number;
  conversions?: number;
  penaltyGoals?: number;
  totalPoints?: number;
};
```

QAプロンプト（`lib/llm/prompts/qa-content.ts` 相当）に、「本文中で選手名とともに具体的なトライ数・コンバージョン数・ペナルティゴール数・合計得点を主張している箇所があれば、その選手名と主張された数値を `statedPlayerStats` 配列として構造化出力すること」という指示を追加する。該当箇所が無ければ空配列でよい。

### 2. 実際の値の計算

`match_events`（QAステージに既に渡されている試合データ。`assemble.ts` の `AssembledContentInput.match_events` を参照）から、選手名でグルーピングし `pointsForMatchEvent` で種別ごとの件数・合計点を計算するヘルパーを新設する（`lib/llm/stages/qa.ts` 内、または `lib/format/match-event-points.ts` に追加）。

### 3. 決定的照合（`applyDeterministicQaGuards`）

既存の `statedWinner` 照合ブロックと同じ場所に、`statedPlayerStats` の各要素について:
- 本文が主張する選手名が `match_events` に一件も登場しない場合 → issue 追加（架空選手への統計）
- 選手名は実在するが、主張された tries/conversions/penaltyGoals/totalPoints のいずれかが実際の集計値と異なる場合 → issue 追加（数値不一致）

新しい issue 定数（例: `PLAYER_STAT_MISMATCH_ISSUE`）を追加し、`WINNER_MISMATCH_ISSUE` と同様に `factual_grounding` スコアを下げる。

## LLM 連携

既存の QA ステージ（`MODELS.FAST` = gpt-4o-mini）の応答スキーマを拡張するのみ。**新規 LLM 呼び出しは発生しない**。プロンプトへの指示追加により出力トークン数がわずかに増える可能性はあるが、コスト影響は無視できる規模。

## 受け入れ条件

1. recap 本文が実在選手に対して `match_events` の実際の集計と異なるトライ数・コンバージョン数・ペナルティゴール数・合計得点を主張したとき、QAステージが issue を検出し `factual_grounding` スコアを下げる
2. recap 本文が `match_events` に一件も登場しない選手名に統計を紐づけて主張したとき、同様に issue を検出する
3. 数値主張が実際の集計と完全に一致する場合、issue は発生しない（偽陽性なし）
4. 統計主張が本文に存在しない（プレースタイル評価のみの記述）場合、`statedPlayerStats` は空配列でよく、チェックはスキップされる
5. 既存の `statedWinner` 照合・`entityViolations` 照合の挙動に変更がない
6. QAステージのLLM呼び出し回数が変更前後で同じ（新規呼び出しが追加されていない）
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
8. `f56e9ee9-14be-49e3-b47d-c51a29c07593`（マツナガ試合）・`42bebc1f-9225-452b-9786-9e0a1fbaa34a`（バートン試合）の実データを使ったテストケースを追加し、両方とも issue が検出されることを確認する

## 未解決の質問

- 本 spec は検出のみで、検出された recap の自動 draft 降格・再生成トリガーまでは含めない。マツナガ・バートンの2試合を含む既存の該当 recap の是正は別途 `content-regen` の手順で対応するか、本 spec の完了条件に含めるかは Owner 判断
- sourced_facts が国際大会（Nations Championship 等）で無効なことが根本原因の一因である点は別 P2 課題（`project_nc_data_pipeline` メモリ参照）。本ゲートは防御層であり、sourced_facts 拡大の代替にはならない旨を認識した上で優先順位を判断してほしい
