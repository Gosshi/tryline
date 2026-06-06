# Codex プロンプト: web_search × JSON モード排他エラー修正

仕様: `specs/fix-web-search-json-mode.md` を参照（内容はインライン展開しない）。

## タスク
`fetch-sourced-facts` が本番で必ず 500 になる不具合を修正する。
OpenAI Responses API は `web_search_preview` ツールと JSON モード
（`text.format.json_object` = response_format）の同時指定を拒否する
（実エラー: `400 Web Search cannot be used with JSON mode`）。

## 変更ファイルと内容

### 1) `lib/llm/openai.ts`
`createWebSearchJsonResponse` の `client.responses.create({...})` から
`text: { format: { type: "json_object" } }` の行を削除する。
`tools: [{ type: "web_search_preview" }]` と `temperature` はそのまま残す。
`createTextResponse` は変更しない。

### 2) `lib/llm/sourced-facts/fetch.ts`
`parseSourcedFactsResponse(text)` を堅牢化する:
- ```json … ``` または ``` … ``` のコードフェンスがあれば中身を取り出す
- 最初の `{` から最後の `}` までを抽出して `JSON.parse` する
- `JSON.parse` が失敗、または `facts` 配列が取れない場合は **throw せず空配列を返す**
  （= web 事実 0 件。route は 200 を返し、grounding は DB 既存事実にフォールバック）
- 既存の `filterAllowedSourcedFacts(...)` 適用は維持する

## 受け入れ条件（完了の定義）
- 型チェック / ビルドが通る（`pnpm build` 相当）。
- `parseSourcedFactsResponse` の単体テストを追加:
  - 純粋な JSON 文字列 → facts 抽出
  - ```json フェンス付き → facts 抽出
  - 前後にプロローグ文がある JSON → facts 抽出
  - 壊れた/JSON でない文字列 → 空配列（throw しない）
  - allowlist 外ドメインは除外される
- `createWebSearchJsonResponse` から JSON モード指定が消えていること。

## エッジケース
- `output_text` が空文字 → 空配列
- `facts` が配列でない（オブジェクト等）→ 空配列
- フェンス内に複数 JSON / 余分なカンマ等は標準 `JSON.parse` の挙動で良い（無理に修復しない）

## 参考パターン
- 既存の `createTextResponse`（同ファイル）と同じ戻り値型 `OpenAITextResponse` を維持。
- 既存の `filterAllowedSourcedFacts` / `resolveConfidence` はそのまま利用。
