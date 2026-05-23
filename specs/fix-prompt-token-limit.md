# LLM パイプライン: assembledInput の JSON.stringify にトークン上限を設ける

## 背景

`lib/llm/prompts/extract-tactical-points.ts:46` で
```typescript
`入力JSON: ${JSON.stringify(input)}`
```
と、`AssembledContentInput` の全フィールドをそのままシリアライズしてプロンプトに埋め込んでいる。

`match_events`（スコアリングイベント）が多い試合や、
`competition_standings`（全チーム順位表）が大きい大会では、
JSON だけで **30,000〜80,000 トークン** を超えるケースがある。

`gpt-4o-mini` のコンテキスト上限は 128k トークンだが、
コスト・レイテンシ・出力品質の観点から、extract ステージへの入力は
**20,000 トークン以内** に収めることが望ましい。

現状は上限チェックがなく、大きな試合で extract ステージが高コストになるリスクがある。

## スコープ

対象:
- `lib/llm/stages/extract-facts.ts` — シリアライズ前に `AssembledContentInput` を間引く

対象外:
- generate / qa ステージ（入力は narrative テキストのため比較的小さい）
- `AssembledContentInput` の型定義変更
- `extract-tactical-points.ts` のプロンプトテキスト

## データモデル変更

なし

## API サーフェス

なし。`extractTacticalPoints(assembled)` シグネチャは変更しない。

## UI サーフェス

なし

## LLM 連携

### 間引きロジック（`lib/llm/stages/extract-facts.ts` に追加）

```typescript
const MAX_EVENTS = 40;           // スコアリングイベント上限
const MAX_STANDINGS_TEAMS = 10;  // 順位表掲載チーム上限

function trimAssembledInput(input: AssembledContentInput): AssembledContentInput {
  return {
    ...input,
    match_events: input.match_events.slice(0, MAX_EVENTS),
    competition_standings: input.competition_standings.slice(0, MAX_STANDINGS_TEAMS),
  };
}
```

`extractTacticalPoints` 内でプロンプトを組む前に
`buildExtractTacticalPointsPrompt(trimAssembledInput(assembled))` を呼ぶ。

### トークン数のウォーニングログ（任意）

シリアライズ後に `JSON.stringify(trimmed).length / 4` で概算トークン数を計算し、
20,000 を超える場合は `console.warn` でログを出す（ブロックはしない）。

## 受け入れ条件

1. `trimAssembledInput` 関数が `extract-facts.ts` に実装されている
2. `match_events` が 40 件を超える場合、先頭 40 件のみがプロンプトに含まれる
3. `competition_standings` が 10 チームを超える場合、先頭 10 チームのみが含まれる
4. 既存の戦術ポイント抽出結果が大きく劣化しない（スポットチェックで確認）
5. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `MAX_EVENTS = 40` / `MAX_STANDINGS_TEAMS = 10` の値は Owner が確認すること。
  ラグビーの標準試合イベント数（トライ・コンバージョン・PG・YC）を踏まえて調整すること
- イベントの間引き順（先頭 40 件 vs 後半 40 件 vs スコアリングイベントのみ）は
  Codex が実装時に判断すること