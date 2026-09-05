仕様書 `specs/fix-health-endpoint-status-and-llm-monitoring.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

`app/api/health/route.ts` は **下位チェックの結果にかかわらず `status: "ok"` を返します。**

```
return NextResponse.json({
  status: "ok",              // ハードコード。checks を見ていない
  checks: { supabase, openai },
```

`checkSupabase` / `checkOpenAI` は `"ok" | "error"` を返しますが、**その値は `checks` に入るだけで `status` に反映されません。**

さらに `checkOpenAI` は `client.models.list()` を呼んでいます。**モデル一覧の取得は残高ゼロでも成功します。**

2026-09-05 に OpenAI の残高がゼロになって全 LLM 機能が止まったとき、health は `status: "ok"` を返し続け、丸1日気づきませんでした。

## 触るファイル

```
app/api/health/route.ts
```

## 実装しないでください

**GitHub Actions の失敗伝播は PR #758 で既に解消しています。** 再実装しないでください。

## 設計のポイント

`status` を `"ok" | "degraded" | "error"` にし、**`checks` から導出**してください。HTTP は `ok`/`degraded` が 200、`error`（Supabase 障害）が 503 です。

`checks.generation` を足してください。**判定は `pipeline_runs` の最終成功時刻からの経過時間**です。閾値は名前付き定数にしてください（初期値48時間）。

**health から生成 API を叩かないでください。** 外形監視が高頻度で叩く可能性があり、毎回課金が発生します。`checks.openai` は現状の `models.list()`（キーの有効性確認）のままでよく、**生成可能かどうかは `checks.generation` で見ます。** これで追加の LLM コストはゼロです。

## 応答に入れてはいけないもの

**このエンドポイントは公開されています。** 残高の金額・API キーの一部・例外の生メッセージを応答に含めないでください。`"ok" | "error"` と経過時間の丸め値までです。

## 変えてはいけないもの

既存フィールド `checks.supabase` / `checks.openai` / `version` / `timestamp` は維持してください。
