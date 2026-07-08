# QAの未検証統計チェックが正当な勝率(%)を誤検知する問題を修正

## 背景

2026-07-08、`南アフリカ vs イングランド`戦（match_id: `b5b2af27-4b42-4d58-8ea9-f13d1e2b1466`）の recap 再生成で、`fix-recap-kick-attempt-ratio-fabrication.md`（PR #511）適用後も依然として QA に reject され続けた。本文を精査したところ、原因は「イングランドは直近5試合で勝率20%と苦戦が続いており」という一文だった。

**この数値は捏造ではない**。DB実データで直接確認したところ、イングランドの直近5試合は France戦・Italy戦・Ireland戦・Scotland戦（敗）・Wales戦（勝）で、1勝4敗＝勝率ちょうど20%と完全に一致する。さらに `lib/llm/stages/assemble.ts` には `win_rate_last_5`（`wins / results.length` から算出）という正当に計算されたフィールドが存在し、`key_stats.home/away` として narrative 生成プロンプトに明示的に提供されている。プロンプト自体も「recent_form の直近5試合から...傾向を読み取り本文に反映すること」（`generate-recap.ts:198`）とこのデータの利用を指示している。

**根本原因**: QAステージの `containsUnsupportedStatistic`（`lib/content/fabrication-guard.ts:65`）は、本文中の `\d+\s*%` パターンを検出すると、`supportedFacts` 配列（`sourcedFacts` + `buildTeamStatsFactStrings(teamStats)`）に一致するものが無ければ「未検証統計」としてreject する。`buildTeamStatsFactStrings`（`qa.ts:156`）は `possession_pct`・`territory_pct` のみを supportedFacts に変換しており、**`key_stats.win_rate_last_5` は一度も supportedFacts に渡されていない**。そのため「勝率20%」のようにナラティブ生成プロンプトが明示的に使うよう指示している正当なデータでも、QA側では根拠のない数値として扱われ、恒久的に reject され続ける。

この不整合により、南アフリカ vs イングランド戦の recap は、win_rate_last_5 を使う限り**理論上何度再生成しても publish に到達しない**状態になっている。

## スコープ

対象:
- `lib/llm/pipeline.ts` の QA呼び出し（`matchContext` 構築箇所、213-221行目付近）に `key_stats`（または win_rate 相当のデータ）を渡すよう配線を追加する
- `lib/llm/prompts/qa-content.ts` の `QaMatchContext` 型に、win_rate を含むフィールドを追加する
- `lib/llm/stages/qa.ts` の supportedFacts 構築ロジック（`buildTeamStatsFactStrings` または新規ヘルパー）を拡張し、`win_rate_last_5` を `buildFactsForSide` と同じ形式（例:「ホームチームの勝率20%」）で supportedFacts に含める

対象外:
- `UNSUPPORTED_STATISTIC_PATTERN` 正規表現自体の変更（`fix-recap-kick-attempt-ratio-fabrication.md` で追加した `\d+回中\d+回` パターンは維持。今回の問題は正規表現でなく supportedFacts の配線漏れ）
- `avg_points_for_last_5` / `avg_points_against_last_5` 等、percentage 以外の `key_stats` フィールドの扱い（`\d+\s*%` にマッチしないため今回は対象外。将来的に別の誤検知が見つかれば別 spec）
- 南アフリカ vs イングランド戦の recap 再生成そのもの（本 spec マージ後、別途 `content-regen` 手順で試す）

## データモデル変更

なし。

## API サーフェス

なし。

## 実装詳細

### 1. `QaMatchContext` 型の拡張（`lib/llm/prompts/qa-content.ts`）

`teamStats` と同様の形で、win_rate を含む型を追加する:

```ts
type TeamFormStats = {
  win_rate_last_5: number | null;
};

export type QaMatchContext = {
  // 既存フィールド...
  formStats?: {
    home: TeamFormStats | null;
    away: TeamFormStats | null;
  };
};
```

型名・配置は既存の `teamStats`（`MatchTeamStats`）の構造に倣い、Codexの裁量で調整してよい。

### 2. `pipeline.ts` の配線

`matchContext` 構築時（213-221行目）に、`assembled.key_stats` から home/away の `win_rate_last_5` を抽出して `formStats` として渡す。

### 3. `qa.ts` の supportedFacts 拡張

`buildFactsForSide`（91-114行目付近）と同じパターンで、win_rate 用の関数を追加するか、既存関数を拡張する:

```ts
if (typeof stats.win_rate_last_5 === "number") {
  facts.push(`${label}チームの勝率${formatPercent(stats.win_rate_last_5)}`);
}
```

`containsUnsupportedStatistic` の呼び出し箇所（`qa.ts:446-449`）で、この新しい fact 文字列群も supportedFacts に含める。

## LLM 連携

なし（QAステージの決定的チェックロジックの配線変更のみ。新規LLM呼び出しなし）。

## 受け入れ条件

1. `win_rate_last_5 = 0.2` が home または away の `key_stats` に存在するとき、本文に「勝率20%」を含む recap が `containsUnsupportedStatistic` によって reject されない
2. `win_rate_last_5` に基づかない、根拠のない別のパーセント表記（例: 実データに無い「成功率80%」）は引き続き reject される（偽陰性化していないこと）
3. `possession_pct`・`territory_pct` を使った既存の supportedFacts 判定に変更がない
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
5. 本 spec は再生成を伴わない。南アフリカ vs イングランド戦の recap 再生成は本 spec マージ後に別途 `content-regen` 手順で試す

## 未解決の質問

- `win_rate_last_5` 以外にも、`key_stats` 配下でナラティブ生成プロンプトが明示的に使用を指示しているが QA の supportedFacts に含まれていないフィールドが無いか、実装時に `generate-recap.ts` のプロンプト指示と `qa.ts` の supportedFacts 構築ロジックを横断的に確認することを推奨する（同種の見落としが他にもある可能性）
