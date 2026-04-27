# Codex プロンプト: fix-json-mode

以下の内容をそのまま Codex にコピペして使用します。

---

タスク: `extract-facts` と `qa` ステージの OpenAI 呼び出しに JSON モードを追加し、LLM がコードブロックで JSON を包んで返す問題を修正する

## 背景

`lib/llm/stages/extract-facts.ts` と `lib/llm/stages/qa.ts` は LLM に JSON を返すよう指示しているが、モデルが ` ```json ... ``` ` のコードブロックで包んで返すことがあり、`JSON.parse` が失敗して 500 エラーになる。

再現エラー:
```
SyntaxError: Unexpected token '`', "```json\n{\n"... is not valid JSON
```

## 影響を受けるファイル

- `lib/llm/openai.ts` — `createTextResponse` に `jsonMode?: boolean` オプションを追加
- `lib/llm/stages/extract-facts.ts` — `jsonMode: true` を渡す
- `lib/llm/stages/qa.ts` — `jsonMode: true` を渡す
- `tests/llm/stages/extract-facts.test.ts` — モック更新
- `tests/llm/stages/qa.test.ts` — モック更新

## 実装前のアクション（重要）

1. `node_modules/openai/resources/responses/responses.d.ts`（または型定義ファイル）を読んで、`client.responses.create` が JSON モードをサポートするパラメータ名を確認する
   - `text?: { format?: { type: "json_object" } }` のような形であれば、それを使う
   - 見つからない場合は `lib/llm/client.ts` を読んで `client.responses` の代わりに `client.chat.completions` を使っているか確認する
2. 確認した正しいパラメータ名を使って実装する。推測で実装しない

## 要件

### `lib/llm/openai.ts`

`createTextResponse` のオプションに `jsonMode?: boolean` を追加し、`true` の場合に OpenAI の JSON モードパラメータを有効にする:

```typescript
export async function createTextResponse(options: {
  model: string;
  input: string;
  temperature?: number;
  jsonMode?: boolean;  // 追加
}): Promise<OpenAITextResponse>
```

`jsonMode: true` のとき、`client.responses.create` に確認したパラメータを追加する。

### `lib/llm/stages/extract-facts.ts`

`createTextResponse` の呼び出しに `jsonMode: true` を追加:

```typescript
const response = await createTextResponse({
  model: MODELS.FAST,
  input: prompt,
  temperature: 0.2,
  jsonMode: true,  // 追加
});
```

### `lib/llm/stages/qa.ts`

`createTextResponse` の呼び出しに `jsonMode: true` を追加:

```typescript
const response = await createTextResponse({
  model: MODELS.FAST,
  input: prompt,
  temperature: 0,
  jsonMode: true,  // 追加
});
```

## 受け入れ条件

- [ ] `lib/llm/openai.ts` の `createTextResponse` が `jsonMode?: boolean` を受け取る
- [ ] `extract-facts.ts` と `qa.ts` が `jsonMode: true` を渡している
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン

## 完了時に必ず報告すること

- 確認した OpenAI SDK の JSON モードパラメータ名と型定義のソース
- 変更した 3 ファイルの差分サマリー
- `pnpm test` の実行結果

## やってはいけないこと

- JSON モードのパラメータ名を推測で実装する（必ず型定義を確認する）
- `generate-narrative.ts` への変更（ナラティブは JSON を返さないため不要）
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え
