# fix-health-endpoint-status-and-llm-monitoring

## 背景

`app/api/health/route.ts` の `GET` は、**下位チェックの結果にかかわらず `status: "ok"` を返す**（2026-09-05 コード確認）。

```
return NextResponse.json({
  status: "ok",              // ハードコード。checks の内容を見ていない
  checks: { supabase, openai },
  ...
});
```

`checkSupabase` / `checkOpenAI` は `"ok" | "error"` を返すが、**その値は `checks` に入るだけで全体の `status` に反映されない**。監視が `status` だけを見ていれば、Supabase が落ちていても健全と判定される。

さらに `checkOpenAI` は `client.models.list()` を呼んでいる。**モデル一覧の取得は残高ゼロでも成功する。**

2026-09-05 に実際に起きた事故がこれと直結する。OpenAI の残高がゼロになり全 LLM 機能が停止したが、GitHub Actions は `failure=8` でも success を返し（PR #758 で解消済み）、**health は `status: "ok"` を返し続けた**。丸 1 日気づかなかった。

**Actions 側の失敗伝播は PR #758 で直ったが、health 側は未修正。** 生成が「実行されなかった」場合（cron が発火しない、対象 0 件）は Actions の失敗としても現れないため、**最後に生成が成功した時刻**を別途見る必要がある。

## スコープ

対象:
- `app/api/health/route.ts`: 全体 `status` を下位チェックから導出する
- 生成能力の監視: 残高ゼロを検知できる形に変える
- 最終生成成功時刻の露出

対象外:
- 外形監視サービスの導入・設定（Owner の作業）
- Discord 通知の追加（health はポーリング用のエンドポイント。通知は別経路）
- `lib/data-integrity/audit.ts` の週次監査（別 spec）
- GitHub Actions の失敗伝播（**PR #758 で解消済み。再実装しない**）
- 認証の追加（現状どおり公開のまま。ただし下記の情報露出に注意）

## データモデル変更

既存pipeline_runsだけで分かるのは段階別実行結果であり、公開保存まで完了したrun全体の成功ではない。stage=4、output.qa.verdict='publish'等の定義を採る場合は名称を『最終QA通過』とし、最終公開保存成功とは区別する。公開保存成功を監視するなら既存match_content.generated_atと対応づける契約、または保存完了ログの追加を仕様として定める。

## API サーフェス

`GET /api/health` の応答を変える。**既存フィールドは削除・改名しない。**

```
status: "ok" | "degraded" | "error"
checks: { supabase, openai, generation }
version, timestamp                       （変更なし）
```

| `status` | 条件 |
|---|---|
| `ok` | すべての checks が `"ok"` |
| `degraded` | いずれかが `"error"` だが `supabase` は `"ok"` |
| `error` | `supabase` が `"error"`（サイトが機能しない） |

HTTPはok/degraded=200、error=503という契約を維持する場合、監視側がJSONのstatus/checksまで読むことを受け入れ条件にする。HTTP200だけでは生成監視を完了と判定しない。

`checks.generation` を追加する。**最後に成功した生成の時刻からの経過時間**で判定する。閾値は定数として定義し、直書きしない。

**情報露出に注意**: エンドポイントは公開されている。**残高の金額・API キーの一部・エラーの生メッセージを応答に含めないこと。** `"ok" | "error"` と経過時間の丸め値までとする。

## UI サーフェス

なし。

## LLM 連携

`checkOpenAI` の呼び出しを見直す。

**`models.list()` は残高ゼロでも成功するため、生成可能性の検証にならない。** ただし health は外形監視から高頻度で叩かれうるため、**毎回の呼び出しで課金の発生する生成 API を叩いてはならない**。

方針: `checks.openai` は **API キーの有効性の確認に留める**（現状の `models.list()` を維持してよい）。**生成可能かどうかは `checks.generation`（`pipeline_runs` の最終成功時刻）で見る。** 直近の生成が閾値を超えて成功していなければ `"error"` とする。

これにより**追加の LLM コストはゼロ**。残高ゼロは「生成が成功しなくなる」形で `checks.generation` に現れる。

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts:16` の `exclude` により次を実行しない — `tests/ingestion/events.test.ts` / `tests/llm/pipeline.test.ts` / `tests/llm/stages/assemble.test.ts` / `tests/health.test.ts` / `tests/db/**`。**本 spec の受け入れテストはこれらに該当する領域なので、「`pnpm test` が green」を完了根拠にしてはならない。**

次のいずれかで**実際に実行されること**を条件とする。

- (a) DB と LLM をモックした単体テストとして、除外されていない新規ファイルに置く
- (b) 除外を外した実行コマンドを用意する

**PR 本文に、実行したコマンドと結果を貼ること。**


1. `checkSupabase` が `"error"` を返すとき、応答の `status` が `"error"` で HTTP 503 になることを検証するテストがある
2. `checkOpenAI` が `"error"`、`checkSupabase` が `"ok"` のとき、`status` が `"degraded"` で HTTP 200 になることを検証するテストがある
3. すべて `"ok"` のとき `status` が `"ok"` で HTTP 200 になることを検証するテストがある
4. `status: "ok"` がハードコードされていない（`checks` から導出している）
5. `checks.generation` が存在し、`pipeline_runs` の最終成功時刻が閾値を超えて古いとき `"error"` になることを検証するテストがある
6. 閾値が名前付き定数として定義されている（マジックナンバーでない）
7. **health の呼び出しで LLM の生成 API（`chat.completions` / `responses`）が呼ばれない**ことを検証するテストがある
8. 応答に残高・金額・API キーの一部・例外の生メッセージが含まれない
9. 既存フィールド `checks.supabase` / `checks.openai` / `version` / `timestamp` が維持されている
10. `pnpm typecheck` が green。テストは下記「テスト実行の条件」を満たすこと

## 未解決の質問

**Owner が仕様改訂時に確定すること。**

1. **最新の失敗が過去の成功より新しい場合**に `checks.generation` をどう判定するか
2. **予定された対象があるのに run が無い場合**の判定元をどこに置くか

**先に進めてよいもの**: `status` の集約（`checks` から `ok` / `degraded` / `error` を導出し、`error` で 503 を返す）は上記に依存しないため、**独立した変更として先行実装してよい**。

48時間は生成鮮度の暫定閾値であり、生成能力・残高切れを即時検出するSLAではない。対象なし/キャッシュのみ/履歴なしをunknownまたはnot_applicableとして区別し、成功扱いにも障害扱いにも自動で寄せない。最新の失敗が過去成功より新しい場合の扱い、予定された対象があるのにrunがない場合の判定元をOwnerが仕様改訂時に確定する。まずstatus集約のみを独立変更として先行してよい。
