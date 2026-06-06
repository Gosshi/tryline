# Fix: web_search と JSON モードの排他エラー（sourced-facts 500）

## 背景
`fetch-sourced-facts` cron が本番で必ず HTTP 500 を返す。OpenAI Responses API の実エラー:

```
400 Web Search cannot be used with JSON mode.
param: 'response_format', type: 'invalid_request_error'
```

原因: `lib/llm/openai.ts` の `createWebSearchJsonResponse` が
`tools: [{ type: "web_search_preview" }]` と
`text: { format: { type: "json_object" } }`（= response_format JSON モード）を
**同時指定**している。Responses API はこの組み合わせを拒否する。
そのため web 検索が走る前に弾かれ、`fetchSourcedFactsForMatch` が throw、
route が `{"error":"Failed to fetch sourced facts"}` / 500 を返す（約3秒で早期失敗）。

確認済みの事実:
- migration 適用済み（`match_sourced_facts` テーブル存在・列正常）
- 決勝 `0fd7d8e6-...` は `competition.family = "league-one"` で `isSourcedFactsEnabledForMatch` = true（スキップされない）
- match select は成功（`competitions.family` 列あり）→ 失敗は LLM 呼び出し段
- `#378`（UUID 検証修正）は本番反映済み（400→解消、現在は 500）

## スコープ
対象:
- `lib/llm/openai.ts` … web_search 呼び出しから JSON モードを外す
- `lib/llm/sourced-facts/fetch.ts` … JSON モードに依存しない堅牢パース

対象外:
- モデル変更（`MODELS.WEB_SEARCH = "gpt-4o"` のまま）
- allowlist / 信頼度ロジック（変更不要）
- DB スキーマ（変更不要）

## 修正内容

### 1. `createWebSearchJsonResponse`（lib/llm/openai.ts）
`text: { format: { type: "json_object" } }` を**削除**する。
`tools: [{ type: "web_search_preview" }]` は残す。
JSON 強制はプロンプト側で既に行っている（"Return JSON only: {...}"）。

修正後の想定:
```ts
const response = (await client.responses.create({
  model: options.model,
  input: options.input,
  temperature: options.temperature ?? 0,
  tools: [{ type: "web_search_preview" }],
} as Parameters<ResponsesCreate>[0])) as OpenAINonStreamingResponse;
```

### 2. 堅牢な JSON 抽出（lib/llm/sourced-facts/fetch.ts `parseSourcedFactsResponse`）
JSON モードを外すと `output_text` に前後文や ```json コードフェンスが混入し得る。
現状の `JSON.parse(text)` は失敗時に throw → 再び 500 になる。
以下を満たすパースに変更:
- ```json / ``` フェンスがあれば中身を取り出す
- 最初の `{` から対応する最後の `}` までを抽出して `JSON.parse`
- パース不能なら throw せず**空配列扱い**（facts 0 件として扱い、route は 200 を返せるようにする）。
  すなわち web 事実が取れなくても content 生成パイプラインを止めない（grounding は DB 既存事実にフォールバック）。

抽出に失敗した場合のログは `console.error` ではなく既存のロガー方針に合わせる（route 側の catch で出している既存ログで十分なら、ここでは静かに空返し）。

## 受け入れ条件
- `POST /api/cron/fetch-sourced-facts?match_id=0fd7d8e6-37f9-4b58-82dd-9c2d5592fd64&content_type=preview&force=true`
  が **HTTP 200** を返す。
- `match_sourced_facts` に決勝の行が allowlist 内ドメインのみで挿入される
  （`source_domain` が allowlist 外の行が無い）。
- web 検索が JSON 以外を返しても route は 500 にならず、空 facts で 200。
- 既存の `createTextResponse`（narrative/extract/QA）には影響しない。
- 型チェック・ビルドが通る。

## 未解決の質問
- web_search 応答が大きい場合のトークン/コスト上限を将来 `max_output_tokens` で絞るか（今回は対象外）。
