# LLM プロンプト: additionalSignals が常に空配列であることをコメントで明示する

## 背景

`lib/llm/pipeline.ts` の `generateNarrative` 呼び出し部分で
```typescript
additionalSignals: [],
```
と常に空配列がハードコードされている。

将来 Reddit スクレイピング（D009）・SNS 反応・外部レポートを signal として
渡すことが想定されているが、現在は常に空配列のため
プロンプト内の `外部シグナル(...)` セクションが常にスキップされている。

この実装意図が不明なため、将来の開発者が「バグ？」「未実装？」と混乱しやすい。

## スコープ

対象:
- `lib/llm/pipeline.ts` — `additionalSignals: []` の行にコメントを追加

対象外:
- `additionalSignals` の実際の値投入（D009 が対象）
- プロンプトテキストの変更

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

なし

## LLM 連携

### `lib/llm/pipeline.ts` の変更

```typescript
// 変更前
additionalSignals: [],

// 変更後
// TODO(D009): Reddit/SNS シグナルが実装されたらここに渡す。現在は常に空配列。
additionalSignals: [],
```

## 受け入れ条件

1. `additionalSignals: []` の行の直上にコメントが追加されている
2. コメントが D009 を参照していることで「意図的な空配列」であることが明確になっている
3. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- D009（Reddit シグナル）の実装フェーズと時期は Owner が確認すること