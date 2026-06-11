# feat-derived-match-stats

## 背景

recap の tactical_depth が伸びない根本原因は「スタッツデータがない」ことだが、外部ソース（公式マッチセンター・有償プロバイダ）の導入はコスト・ToS リスクが大きい。一方、既に保持している `match_events`（type・minute・team・player）と lineups（position・jersey_number・is_starter）から、**捏造リスクゼロで導出できる派生スタッツ**がまだ多数ある。

現状 `assemble.ts` が計算しているのは HT スコア・リードチェンジ・決勝点・トライ/PG 数・late_scoring のみで、events の情報量を使い切っていない。

本 spec は events からの派生計算を追加し、生成プロンプトに「derived_stats」ブロックとして注入することで、recap の具体性（連続得点・逆転幅・シンビン中の失点等）を底上げする。

**設計不変条件への適合**: すべて DB 実データからの決定的計算。LLM 推測なし。新規スクレイプなし。LLM コスト影響は +100〜200 入力トークン程度。

## スコープ

対象:
- `lib/llm/stages/derived-stats.ts`（新規）: `computeDerivedMatchStats` + `DerivedMatchStats` 型
- `lib/llm/types.ts`: `AssembledContentInput` に `derived_stats` 追加
- `lib/llm/stages/assemble.ts`: 派生計算の呼び出し
- `lib/llm/prompts/generate-recap.ts`: derived_stats ブロック注入 + `PROMPT_VERSION = "recap@4.9.0"`
- `lib/llm/prompts/qa-content.ts`: `QaMatchContext` に derivedStats 追加（QA が派生数値を「入力にない記述」として誤って減点しないため）
- `lib/llm/pipeline.ts`: QA 呼び出し時に derivedStats を渡す
- テスト追加・バージョン文字列更新

対象外:
- preview への注入（events は試合後にしか存在しないため recap のみ）
- 外部スタッツソースの導入（第3層・別判断）
- `containsUnsupportedStatistic` ガードの変更（後述の表記ルールで回避）
- 既存 recap のバッチ再生成（別タスク・要承認）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

- recap 生成プロンプト（Stage 3, gpt-4o）に派生スタッツブロックを追加
- QA プロンプト（gpt-4o-mini）の matchContext に派生スタッツを追加
- `PROMPT_VERSION = "recap@4.9.0"`（from 4.8.0）。`qa-content.ts` は `"qa@2.2.0"`（from 2.1.0）

### 捏造ガードとの整合（重要な設計判断）

`containsUnsupportedStatistic` は「成功率」「%」等のキーワードを sourced_facts に裏付けがない限りブロックする。ガードを改修する代わりに、**プロンプト側で表記を制約**する:

- キック成功は「ゴール4/5」のような**分数表記のみ**。「成功率」「80%」等の表記は禁止
- 派生スタッツ由来の数値は points/本数/分数で表現し、percentage に換算しない

これによりガード変更ゼロで両立する。

## 変更詳細

### 1. `lib/llm/stages/derived-stats.ts`（新規）

```typescript
import type { AssembledContentInput } from "@/lib/llm/types";

const SCORING_RUN_MIN_POINTS = 10;
const SCORELESS_PERIOD_MIN_MINUTES = 15;
const SIN_BIN_MINUTES = 10;
const MATCH_END_MINUTE = 80;

export type DerivedMatchStats = {
  // 10点以上の連続得点（相手の得点で途切れる）
  scoring_runs: Array<{
    team: "home" | "away";
    points: number;
    start_minute: number;
    end_minute: number;
  }>;
  // 試合中の最大リード
  max_lead: { team: "home" | "away"; points: number; minute: number } | null;
  // 勝者が一度ビハインドだった場合の最大ビハインド幅
  comeback: { team: "home" | "away"; deficit_overcome: number } | null;
  // 両チーム無得点が15分以上続いた時間帯
  scoreless_periods: Array<{ from_minute: number; to_minute: number }>;
  // コンバージョン成功数/試行数（試行数 = penalty try を除くトライ数）
  conversions: {
    home: { made: number; attempts: number };
    away: { made: number; attempts: number };
  };
  // 得点手段の内訳（points 換算）
  points_breakdown: {
    home: { tries: number; conversions: number; penalties: number; drop_goals: number };
    away: { tries: number; conversions: number; penalties: number; drop_goals: number };
  };
  // カードと、そのシンビン時間帯（yellow: 10分 / red: 残り全部）に相手が奪った得点
  cards: Array<{
    team: "home" | "away";
    player: string;
    type: "yellow_card" | "red_card";
    minute: number;
    opponent_points_during: number;
  }>;
  // トライスコアラーのポジション情報（lineups と join できた場合のみ）
  try_scorers: Array<{
    player: string;
    team: "home" | "away";
    minute: number | null;
    position: string | null;
    jersey_number: number | null;
    is_starter: boolean | null;
  }>;
  // 後半の得失点（HT スコアと最終スコアの差分）
  second_half: { home_points: number; away_points: number } | null;
};

export function computeDerivedMatchStats(
  events: AssembledContentInput["match_events"],
  lineups: AssembledContentInput["projected_lineups"],
  homeTeamName: string,
  awayTeamName: string,
): DerivedMatchStats | null;
```

計算ルール:
- `minute === null` のイベントは時間依存メトリクス（scoring_runs / scoreless_periods / cards / max_lead）から除外。conversions / points_breakdown / try_scorers にはカウントする
- `team_name` が両チーム名のどちらにも一致しないイベントは skip（既存 `computeMatchStats` と同じ作法）
- 得点換算は既存 `pointsForEventType` と同一ロジック（try=5 / conversion=2 / penalty・penalty_goal・drop_goal=3）。重複定義を避けるため `pointsForEventType` を assemble.ts から export して import する
- conversions の attempts は `is_penalty_try === true` のトライを除いたトライ数
- cards: yellow は `[minute, minute + 10]`、red は `[minute, 80]` の範囲で相手チームの得点 points を合算
- scoreless_periods: 得点イベント間（および最終得点〜80分）のギャップが15分以上の区間。前半開始〜初得点も対象
- try_scorers の position join: `player_name` と lineups の `name` の完全一致のみ（部分一致・あいまい一致はしない。一致しなければ position は null）
- events が 0 件なら `null` を返す

### 2. `lib/llm/types.ts`

`AssembledContentInput` に追加:

```typescript
derived_stats: DerivedMatchStats | null;
```

`DerivedMatchStats` の定義場所は `ScoreTimeline` と揃える（types.ts に置き、derived-stats.ts から import する形でもよい。循環 import を避けること）。

### 3. `lib/llm/stages/assemble.ts`

`computeScoreTimeline` 呼び出し（L702 付近）の直後で:

```typescript
const derivedStats = computeDerivedMatchStats(
  matchEvents,
  projectedLineups,
  homeTeamName,
  awayTeamName,
);
```

assembled オブジェクトに `derived_stats: derivedStats` を追加。

### 4. `lib/llm/prompts/generate-recap.ts`

`PROMPT_VERSION = "recap@4.9.0"`。

`scoreTimelineBlock` の直後に新ブロックを追加:

```typescript
const derivedStatsBlock = !assembled.derived_stats
  ? ""
  : [
      "【派生スタッツ derived_stats】以下は得点イベントから機械的に算出した実数値です。本文の根拠として自由に使ってよい。",
      "連続得点・逆転幅・シンビン中の失点・得点手段の内訳・トライスコアラーのポジションは、戦術描写の具体化に積極的に使うこと。",
      "キック成功は「ゴール4/5」のような分数表記のみ。「成功率」「○%」のようなパーセント表記は使用禁止。",
      JSON.stringify(assembled.derived_stats),
    ].join("\n");
```

プロンプト末尾の配列に `derivedStatsBlock` を追加（`scoreTimelineBlock` の隣）。

### 5. `lib/llm/prompts/qa-content.ts`

`PROMPT_VERSION = "qa@2.2.0"`。

`QaMatchContext` に追加:

```typescript
export type QaMatchContext = {
  awayScore: number | null;
  awayTeam: string;
  derivedStats?: DerivedMatchStats | null;
  homeScore: number | null;
  homeTeam: string;
  sourcedFacts?: SourcedFactInput[];
};
```

プロンプトにブロック追加（sourcedFactsBlock と同様の位置）:

```typescript
const derivedStatsBlock = !matchContext.derivedStats
  ? ""
  : [
      "## derived_stats grounding",
      "以下は得点イベントから機械的に算出された実数値です。本文がこれらの数値（連続得点・コンバージョン成否・シンビン中の失点等）に言及している場合、入力データに基づく正当な記述として扱い factual_grounding を下げないこと。",
      JSON.stringify(matchContext.derivedStats),
    ].join("\n");
```

### 6. `lib/llm/pipeline.ts`

QA 呼び出し2箇所（L245・L368 付近、`sourcedFacts: assembled.sourced_facts` を渡している所）に追加:

```typescript
derivedStats: assembled.derived_stats,
```

### 7. テスト

新規 `tests/llm/stages/derived-stats.test.ts`（合成イベントで全メトリクスを検証）:
- 17 連続得点 → scoring_runs に1件（points=17）
- 勝者が前半 12 点ビハインド → comeback.deficit_overcome = 12
- yellow card 50分 + 相手が 55分・58分に計 10 点 → opponent_points_during = 10
- penalty try 1 + 通常トライ 2 + conversion 2 → conversions.attempts = 2, made = 2
- minute null のイベントが scoring_runs に影響しない
- events 空 → null

バージョン文字列更新:
- `"recap@4.8.0"` → `"recap@4.9.0"`（`tests/llm/prompts/generate-recap.test.ts`・`tests/scripts/regenerate-overseas-content.test.ts`）
- `"qa@2.1.0"` をアサートしているテストがあれば `"qa@2.2.0"` に更新

generate-recap のプロンプトテストに「derived_stats がある場合ブロックが含まれる」「分数表記指示が含まれる」を追加。

## 受け入れ条件

1. `computeDerivedMatchStats` の単体テストが上記ケースをすべてパスする
2. derived_stats ありで recap プロンプトを生成すると「派生スタッツ derived_stats」「分数表記のみ」が含まれる
3. derived_stats が null（events 0件）のとき、プロンプトにブロックが入らない（recap 自体は events 0件で skip されるが、防御的に確認）
4. `buildQaContentPrompt` に derivedStats を渡すと「derived_stats grounding」ブロックが含まれる
5. `pnpm test` 全体が通る・TypeScript strict エラーなし
6. 既存の score_timeline・key_stats の出力が変化しない（リグレッションなし）

## 未解決の質問

- penalty try の得点換算: 現行 `pointsForEventType` は try=5 固定だが、penalty try は 7 点（コンバージョン不要）。score_timeline の既存計算にも影響するため、本 spec では現行ロジックを踏襲し、修正は別 spec とする（イベント合計≠最終スコア不一致 27% の一因の可能性あり → 調査価値あり）
- 派生スタッツの反映には再生成が必要。保留中のバッチ再生成を実施する際に recap@4.9.0 でまとめて反映するのが効率的
