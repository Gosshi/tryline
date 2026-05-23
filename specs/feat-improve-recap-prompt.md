# レビュープロンプト品質改善

## 背景

2026-05-23 のリーグワン準々決勝（サントリー 40-35 リコー）で生成されたレビューが「いまいち」だった。
前半 27-10 → 78分リコー逆転 → 84分サントリー再逆転という劇的な展開が描写されていない。

**根本原因は3つ:**

1. **スコア推移がプロンプトに渡されていない** — モデルが `match_events` の生配列から HT スコア・逆転時刻を自力で計算しなければならないが、明示的な指示がないためスキップしている
2. **セクション見出しが守られていない** — プロンプトは `試合全体像 / ターニングポイント / 次戦への示唆` を指示しているが、実際は `試合概要 / 試合全体像` という別構成が生成される
3. **events あり・lineup なしケースの字数目標が低い** — 1,500字目標に対し 1,422字。ターニングポイントセクションが事実上存在しない

## スコープ

**対象:**
- `lib/llm/types.ts` — `ScoreTimeline` 型追加、`AssembledContentInput` に追加
- `lib/llm/stages/assemble.ts` — `computeScoreTimeline` 関数追加、assembled に含める
- `lib/llm/prompts/generate-recap.ts` — 構成・字数・スコア注入・ターニングポイント指示を強化
- `lib/llm/prompts/qa-content.ts` — ターニングポイントセクション存在チェック追加
- `lib/llm/stages/qa.ts` — `buildQaContentPrompt` 呼び出しに `hasEvents` フラグを追加
- `lib/llm/pipeline.ts` — `evaluateNarrativeQuality` 呼び出しに `hasEvents` フラグを渡す

**対象外:**
- preview プロンプト（今回は recap のみ）
- extract / shared-prompt-blocks（変更不要）
- パイプラインの実行フロー（変更なし）

## 実装詳細

### 1. `lib/llm/types.ts`

`AssembledContentInput` に `score_timeline` フィールドを追加する。

```typescript
export type ScoreTimeline = {
  ht_home: number;   // 前半終了時（minute <= 40）のホーム累計得点
  ht_away: number;   // 前半終了時のアウェイ累計得点
  lead_changes: Array<{
    minute: number;
    home: number;
    away: number;
    new_leader: "home" | "away" | "draw";
  }>;
  winning_score: {   // 最終リードを確立した最後の得点イベント
    minute: number;
    player: string;
    team: "home" | "away";
    type: string;
  } | null;
};
```

`AssembledContentInput` の末尾に追加:

```typescript
score_timeline: ScoreTimeline | null;  // match_events が空の場合は null
```

### 2. `lib/llm/stages/assemble.ts`

#### `computeScoreTimeline` 関数を追加

既存の `average` / `computeTeamFormStats` 等のヘルパー関数の近くに追加する。

```typescript
function computeScoreTimeline(
  events: AssembledContentInput["match_events"],
  homeTeamName: string,
  awayTeamName: string,
): ScoreTimeline | null {
  if (events.length === 0) return null;

  function pointsFor(type: string): number {
    if (type === "try") return 5;
    if (type === "conversion") return 2;
    if (type === "penalty_goal" || type === "drop_goal") return 3;
    return 0;
  }

  let homeScore = 0;
  let awayScore = 0;
  let htHome = 0;
  let htAway = 0;
  let htSet = false;
  const leadChanges: ScoreTimeline["lead_changes"] = [];
  let prevLeader: "home" | "away" | "draw" = "draw";
  let winningScore: ScoreTimeline["winning_score"] = null;

  for (const event of events) {
    const minute = event.minute ?? 0;
    const pts = pointsFor(event.type);
    if (pts === 0) continue;

    const isHome = event.team_name === homeTeamName;
    if (isHome) homeScore += pts;
    else awayScore += pts;

    // 前半終了スコア（minute > 40 の最初のイベント直前）
    if (!htSet && minute > 40) {
      htHome = homeScore - (isHome ? pts : 0);
      htAway = awayScore - (!isHome ? pts : 0);
      htSet = true;
    }

    // リード変化チェック
    const currentLeader: "home" | "away" | "draw" =
      homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";
    if (currentLeader !== prevLeader) {
      leadChanges.push({ minute, home: homeScore, away: awayScore, new_leader: currentLeader });
      prevLeader = currentLeader;
    }
  }

  // 全イベントが前半内だった場合
  if (!htSet) { htHome = homeScore; htAway = awayScore; }

  // 最終的に勝者側の最後の得点イベントを winning_score とする
  const winner = homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : null;
  if (winner) {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const pts = pointsFor(event.type);
      if (pts === 0) continue;
      const isHomeEvent = event.team_name === homeTeamName;
      if ((winner === "home" && isHomeEvent) || (winner === "away" && !isHomeEvent)) {
        winningScore = {
          minute: event.minute ?? 0,
          player: event.player_name,
          team: winner,
          type: event.type,
        };
        break;
      }
    }
  }

  return { ht_home: htHome, ht_away: htAway, lead_changes: leadChanges, winning_score: winningScore };
}
```

#### `assembleMatchContentInput` の戻り値に追加

`match_events` が確定した後（`assembled` オブジェクト組み立て箇所、現在の約 571 行目付近）:

```typescript
score_timeline: computeScoreTimeline(
  matchEvents,
  match.home_team?.name ?? "",
  match.away_team?.name ?? "",
),
```

### 3. `lib/llm/prompts/generate-recap.ts`

#### バージョン更新

```typescript
export const PROMPT_VERSION = "recap@4.0.0";
```

#### `structureInstruction` を3ケースすべてで見出し名を固定・字数目標を引き上げ

**`hasLineups` が true の場合:**
```
以下のセクション見出しを必ずそのまま使用すること（他の見出し名への変更は禁止）:
# 試合全体像（400-500字）
# ターニングポイント（500-600字）
# MOM（300-400字）
# 次戦への示唆（300-400字）
全体で2,000字以上を目標とすること。${sectionHeadingInstruction}
```

**`isDataSparse` が true の場合（イベントなし・ラインアップなし）:**
```
以下のセクション見出しを必ずそのまま使用すること（他の見出し名への変更は禁止）:
# 試合全体像（500-600字）
# 大会文脈と順位への影響（400-500字）
# 両チームの近況と戦術傾向（500-600字）
# 次戦への示唆（300-400字）
全体で2,000字以上を目標とすること。MOM セクションは省略すること。${sectionHeadingInstruction}
```

**イベントあり・ラインアップなし（最も一般的なケース）:**
```
以下のセクション見出しを必ずそのまま使用すること（他の見出し名への変更は禁止）:
# 試合全体像（400-500字）
# ターニングポイント（600-700字）
# 次戦への示唆（300-400字）
全体で2,000字以上を目標とすること。MOM セクションは省略すること（ラインアップデータなし）。${sectionHeadingInstruction}
```

#### `scoreTimelineBlock` を新規追加

`matchEventsBlock` の直後に挿入する。`hasEvents && assembled.score_timeline` が存在する場合のみ生成:

```typescript
const scoreTimelineBlock = (() => {
  if (!hasEvents || !assembled.score_timeline) return "";

  const { ht_home, ht_away, lead_changes, winning_score } = assembled.score_timeline;
  const homeTeam = assembled.match.home_team?.name ?? "ホーム";
  const awayTeam = assembled.match.away_team?.name ?? "アウェイ";

  const lines: string[] = [
    "スコア推移サマリー（# ターニングポイントの骨格として必ず使うこと）:",
    `- 前半終了時スコア: ${homeTeam} ${ht_home} — ${awayTeam} ${ht_away}`,
  ];

  if (lead_changes.length === 0) {
    lines.push("- リード変化: なし（一方が終始リード）");
  } else {
    const changes = lead_changes
      .map((c) =>
        `${c.minute}分: ${c.new_leader === "home" ? homeTeam : c.new_leader === "away" ? awayTeam : "同点"} ${c.home}—${c.away}`)
      .join(" → ");
    lines.push(`- リード変化: ${changes}`);
  }

  if (winning_score) {
    const winTeam = winning_score.team === "home" ? homeTeam : awayTeam;
    lines.push(
      `- 勝利を決めた得点: ${winning_score.minute}分 ${winTeam} ${winning_score.player}（${winning_score.type}）`,
    );
  }

  lines.push(
    "# ターニングポイントでは、最後にリードが入れ替わった時点を起点に、" +
    "その前後の流れ（何が崩壊し、何が機能したか）を時刻・スコア・選手名で具体的に論じること。" +
    "「〜した」という事実の羅列ではなく、試合全体の流れへの影響まで分析すること。",
  );

  return lines.join("\n");
})();
```

プロンプト配列（`return [...]` ブロック）では `matchEventsBlock` の直後に `scoreTimelineBlock` を追加する。

#### `matchPhaseBlock` の `playoff_other` ケースを拡張

現在の1文から以下に変更:

```typescript
if (phase === "playoff_other") {
  return [
    "この試合はプレーオフ戦（準々決勝または3位決定戦）です。",
    "敗者はそこでシーズン終了となる一発勝負の意義を # 試合全体像 の冒頭に必ず含めること。",
    `# 次戦への示唆では、competition_standings から勝者の次の対戦相手（${competitionLabel}の次のプレーオフ対戦相手）を特定して言及すること。`,
  ].join(" ");
}
```

### 4. `lib/llm/prompts/qa-content.ts`

#### 関数シグネチャに `hasEvents` を追加

```typescript
export function buildQaContentPrompt(
  contentType: ContentType,
  narrative: string,
  language: ContentLanguage,
  matchContext: QaMatchContext,
  hasEvents = false,  // ← 追加
): string {
```

#### ターニングポイントチェックブロックを追加

`winnerCheckBlock` の直後に:

```typescript
const turningPointCheckBlock =
  contentType === "recap" && hasEvents
    ? [
        "## セクション構成チェック（events がある recap のみ適用）",
        "本文に「# ターニングポイント」という見出しが含まれているかチェックすること。",
        "含まれていない場合は issues に「ターニングポイントセクションが欠落しています」を追加し、",
        "information_density のスコアを最大 3 に制限すること。",
      ].join("\n")
    : "";
```

プロンプト配列に `winnerCheckBlock` の直後に `turningPointCheckBlock` を追加する。

### 5. `lib/llm/stages/qa.ts`

`buildQaContentPrompt` を呼び出している箇所で `hasEvents` フラグを渡す。qa.ts が `hasEvents` を知るためには、`evaluateNarrativeQuality` の引数として受け取る必要がある。

```typescript
export async function evaluateNarrativeQuality(
  narrative: string,
  contentType: ContentType,
  language: ContentLanguage,
  matchContext: QaMatchContext,
  hasEvents = false,  // ← 追加
): Promise<...> {
  const prompt = buildQaContentPrompt(contentType, narrative, language, matchContext, hasEvents);
  // ...
}
```

### 6. `lib/llm/pipeline.ts`

`evaluateNarrativeQuality` の呼び出し箇所で `hasEvents` を渡す:

```typescript
const hasEvents = assembled.match_events.length > 0;
// ...
await evaluateNarrativeQuality(narrative, contentType, language, matchContext, hasEvents);
```

## 受け入れ条件

1. `match_events` がある recap を生成したとき、プロンプトに「スコア推移サマリー」ブロックが含まれる
2. 生成されたレビューに `# ターニングポイント` という見出しが存在する
3. イベントあり・ラインアップなしケースで生成文字数が 2,000字以上になる
4. QA が `# ターニングポイント` のない recap を `information_density 4以上` で通過させない
5. `ScoreTimeline` の計算が今回の試合データで正しい結果を返す:
   - `ht_home: 27, ht_away: 10`
   - `lead_changes` に 78分リコー逆転（35-33）・84分サントリー再逆転（38-35 or 40-35）が含まれる
   - `winning_score`: 84分 森川由起乙 try（home）

## 参考

- 今回の試合 ID: `2cbc8b44-2404-42c0-8ea3-6e96cf4ac3f6`
- 実際のスコア推移:
  - HT: サントリー 27 — リコー 10
  - 78分: 中楠一期 PG でリコーが 35-33 に逆転
  - 84分: 森川由起乙 try + コルビ CV でサントリー 40-35 に再逆転
- 現行バージョン: `recap@3.0.0` → 改訂後: `recap@4.0.0`
- 変更ファイル一覧: `lib/llm/types.ts`, `lib/llm/stages/assemble.ts`, `lib/llm/prompts/generate-recap.ts`, `lib/llm/prompts/qa-content.ts`, `lib/llm/stages/qa.ts`, `lib/llm/pipeline.ts`