# QA パイプライン: resolveVerdict 二重管理を解消する

## 背景

現在、verdict（publish / retry / reject）の判断ロジックが 2 か所に存在する。

1. `lib/llm/prompts/qa-content.ts:82` — LLM への指示テキスト
   ```
   "verdict判定: tactical_depth が 2 以下なら無条件で retry。それ以外は: いずれか2以下なら retry、
    全て3以上なら publish、重大欠陥で再試行価値がなければ reject。"
   ```

2. `lib/llm/stages/qa.ts:27-54` — `resolveVerdict()` 関数
   - LLM が返した `verdict` フィールドを**無視し**、スコアだけで再計算している

2 か所が乖離すると、LLM が「publish」を返しても `resolveVerdict` が「retry」に
上書きし、原因追跡が困難になる。また、プロンプトに書かれたルールが
コードのルールと矛盾した場合にどちらが優先されるか不明瞭。

## スコープ

対象:
- `lib/llm/stages/qa.ts` — `resolveVerdict` を Single Source of Truth として整備
- `lib/llm/prompts/qa-content.ts` — LLM への verdict 指示を削除し、スコア付け指示のみにする

対象外:
- QA スコアの閾値変更（既存ロジックを維持する）
- LLM モデルの変更

## データモデル変更

なし

## API サーフェス

なし。`QaResult.verdict` 型・`evaluateNarrativeQuality` インターフェイスは変更しない。

## UI サーフェス

なし

## LLM 連携

### 変更方針

`qa-content.ts` のプロンプトから verdict 計算指示を削除し、
LLM には **スコアを正確に付ける** ことだけを求める。
verdict の計算は `qa.ts:resolveVerdict()` が完全に担う。

```typescript
// qa-content.ts — 変更前（verdict 指示が含まれている）
'JSONのみで返答。スキーマ: {"scores":{...},"issues":string[],"verdict":"publish"|"retry"|"reject"}',
"verdict判定: tactical_depth が 2 以下なら無条件で retry（一般論を書き直させる）。...",

// qa-content.ts — 変更後（スコアリングのみ）
'JSONのみで返答。スキーマ: {"scores":{...},"issues":string[]}',
// verdict フィールドは LLM に出力させない。qa.ts が resolveVerdict() で決定する。
```

`parseQaResponse` 内では `parsed.verdict` を参照せず、
常に `resolveVerdict(parsed.scores, retryCount)` の結果を使う。

### `resolveVerdict` の整備

コメントを追加して、この関数が Single Source of Truth であることを明示する。
閾値は変更しない（`tactical_depth <= 2` → retry/reject、全スコア >= 3 → publish）。

## 受け入れ条件

1. `qa-content.ts` のプロンプトに verdict 計算指示が含まれていない
2. `parseQaResponse` が LLM の `verdict` フィールドを参照していない
3. `resolveVerdict` が唯一の verdict 決定ロジックである
4. 既存の QA 閾値（tactical_depth <= 2 → retry、全スコア >= 3 → publish）が維持されている
5. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

なし