# QA ステージ: ファクトチェックにスコア・チームデータを渡す

## 背景

`buildQaContentPrompt`（`lib/llm/prompts/qa-content.ts`）は recap の QA 時に
「home_score と away_score を確認すること」とプロンプトで指示している。
しかし実際には `buildQaContentPrompt(contentType, narrative, language)` の引数に
スコアもチーム名も渡されていないため、LLM は確認する手段がなく
`factual_grounding` スコアと `winnerCheckBlock` が機能不全に陥っている。

これにより「敗者チームが勝利したかのように書かれたレビュー」を reject できない
状態が続いており、コンテンツ品質の安全網として機能していない。

## スコープ

対象:
- `lib/llm/prompts/qa-content.ts` — 引数シグネチャの拡張とプロンプト本文への埋め込み
- `lib/llm/stages/qa.ts` — 呼び出し側で `assembled` からスコア・チーム名を渡す

対象外:
- QA の verdict ロジック・リトライ回数・モデル変更
- データモデル変更

## データモデル変更

なし

## API サーフェス

### `buildQaContentPrompt` のシグネチャ変更

```typescript
// 変更前
export function buildQaContentPrompt(
  contentType: ContentType,
  narrative: string,
  language: ContentLanguage = "ja",
): string

// 変更後
export type QaMatchContext = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

export function buildQaContentPrompt(
  contentType: ContentType,
  narrative: string,
  language: ContentLanguage,
  matchContext: QaMatchContext,
): string
```

### 呼び出し側の変更

`lib/llm/stages/qa.ts` 内の `evaluateNarrativeQuality` の呼び出し時に
`assembled` から `matchContext` を構築して渡す。

`assembled` は `lib/llm/pipeline.ts` の stage 1 で取得済み。
以下のフィールドを使用する:
- `assembled.home_team.name` → `homeTeam`
- `assembled.away_team.name` → `awayTeam`
- `assembled.home_score` → `homeScore`（null 許容）
- `assembled.away_score` → `awayScore`（null 許容）

## UI サーフェス

なし（パイプライン内部の変更のみ）

## LLM 連携

- 対象ステージ: stage 4（QA）
- 変更内容: `winnerCheckBlock` 内の指示を実際のスコア値に置き換える

  ```
  ## 勝者整合性チェック
  この試合のスコア: {homeTeam} {homeScore} — {awayTeam} {awayScore}
  スコアが高い方が実際の勝者。本文中で敗者チームが勝利したかのように書かれていれば
  factual_grounding を 1 にして verdict を reject にすること。
  引き分け（同点）の場合はこのチェックを無視する。
  ```

- preview の場合は試合前なのでスコアが null になる。`winnerCheckBlock` は
  `contentType === "recap"` かつ `homeScore !== null` のときのみ出力する（現行と同じ条件を維持）

## 受け入れ条件

1. `buildQaContentPrompt` のシグネチャに `matchContext: QaMatchContext` が追加されている
2. recap の QA プロンプトに実際の数値スコアとチーム名が埋め込まれている
3. `evaluateNarrativeQuality` の呼び出し時に `assembled` から取り出したスコア・チーム名が渡されている
4. preview（スコア null）のとき `winnerCheckBlock` がプロンプトに出力されない（既存動作を維持）
5. `tsc --noEmit` でビルドエラーなし
6. 既存の QA リトライ・reject ロジックに変更がない

## 未解決の質問

- `lib/llm/stages/qa.ts` の `evaluateNarrativeQuality` 現行シグネチャを確認し、
  `matchContext` の受け渡し方を最小差分で決める（呼び出し元から渡すか、
  または `assembled` をそのまま引数に追加するか）。
