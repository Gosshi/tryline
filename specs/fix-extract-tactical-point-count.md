# LLM 抽出: 戦術ポイント数をデータ量・試合重要度に応じて可変化する

## 背景

`lib/llm/prompts/extract-tactical-points.ts` の extract プロンプトは
戦術ポイントを常に **3 つ** 出力するよう指示している（暗黙的に配列 1 要素で例示）。

しかし実際には:
- データが豊富な試合（ラインアップ + 全イベント + 順位表あり）→ 4〜5 ポイントが適切
- データが乏しい試合（スコアのみ）→ 2 ポイントが限界で、3 つ目はでたらめになる

固定 3 件では、データが少ない試合で LLM が根拠のない戦術ポイントを捏造するリスクがある。

## スコープ

対象:
- `lib/llm/prompts/extract-tactical-points.ts` — 出力件数指示を可変化

対象外:
- `lib/llm/stages/extract-facts.ts` — `extractTacticalPoints` の呼び出し側の変更なし
- downstream（generate プロンプト）の変更

## データモデル変更

なし

## API サーフェス

なし。`TacticalPoint[]` の返却型は変わらない。

## UI サーフェス

なし

## LLM 連携

### プロンプトの変更

```typescript
// 変更前
"... 試合の勝敗を左右する戦術的次元を3つ特定してください。"

// 変更後
"... 試合の勝敗を左右する戦術的次元を特定してください。出力件数の目安:\n" +
"- ラインアップ + イベント + 順位表がすべて揃っている: 4〜5 件\n" +
"- ラインアップまたはイベントどちらかある: 3 件\n" +
"- スコアのみ（データが乏しい）: 2 件\n" +
"- 根拠のある戦術次元がなければ2件でも可。でたらめに埋めないこと。"
```

### PROMPT_VERSION の更新

`fix-extract-match-impact-criteria.md` と同じ PR で実装する場合は
最終的な PROMPT_VERSION を `extract@2.2.0` とすること。

## 受け入れ条件

1. プロンプトに件数の目安が明記されている
2. データスパース試合（イベントなし）で extract を実行すると 2 件が返ってくる（手動確認）
3. データ豊富な試合で 4〜5 件が返ってくる（手動確認）
4. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `fix-extract-match-impact-criteria.md` と同じ PR で実装する場合、
  PROMPT_VERSION の最終値は Codex が整合を取ること
- 可変件数を受け取る downstream（generate プロンプト）に変更が必要か
  Codex が `generate-preview.ts` を確認して判断すること