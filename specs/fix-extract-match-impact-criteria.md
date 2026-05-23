# LLM 抽出: match_impact 判断基準を明示して出力品質を安定化する

## 背景

`lib/llm/prompts/extract-tactical-points.ts:23` の extract プロンプトで
`match_impact: "high | medium | low"` とフィールドを定義しているが、
**どの条件で high / medium / low を選ぶかの基準が一切書かれていない**。

LLM が独自の基準で判定するため、同じ試合でも実行ごとに結果が変動し、
downstream の narrative 生成に渡した際に「important match」vs「routine match」
として扱われる一貫性がなくなる。

## スコープ

対象:
- `lib/llm/prompts/extract-tactical-points.ts` — `match_impact` の判断基準を追加

対象外:
- `match_impact` を使う downstream コード（`generate-preview.ts`、`generate-recap.ts`）の変更
- `match_impact` フィールドの削除・型変更

## データモデル変更

なし（プロンプトテキストの変更のみ）

## API サーフェス

なし

## UI サーフェス

なし

## LLM 連携

### `extract-tactical-points.ts` の変更

```typescript
// 変更前
match_impact: "high | medium | low",

// 変更後（JSON スキーマのコメントとして隣接配置）
"match_impact: high | medium | low",
"  high   = 大会優勝・降格・プレーオフ進出がこの試合の結果に直接かかっている、",
"           または両チームの勝率・得失点差が統計的に拮抗（10%以内）している",
"  medium = 順位に影響するが決定的ではない（プール戦中盤など）",
"  low    = 大会結果への影響が軽微（消化試合・大差が開いているグループ戦など）",
```

JSON スキーマは文字列として出力されるため、
`JSON.stringify` の値に直接コメントを挿入できない。
代わりに、スキーマ定義の **前** に説明テキストブロックとして追加すること。

### PROMPT_VERSION の更新

```typescript
// 変更前
export const PROMPT_VERSION = "extract@2.0.0";

// 変更後
export const PROMPT_VERSION = "extract@2.1.0";
```

## 受け入れ条件

1. プロンプト内に `match_impact` の high / medium / low 判断基準が明記されている
2. 同じ試合データを複数回 extract した際に `match_impact` が安定する（手動確認 3 回）
3. `PROMPT_VERSION` が `extract@2.1.0` に更新されている
4. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- 判断基準の文言は Owner が最終確認すること（上記はたたき台）
- `match_impact` の値が narrative 生成でどう利用されているかは
  Codex が `generate-preview.ts` / `generate-recap.ts` を確認してから実装すること