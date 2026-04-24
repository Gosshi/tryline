# パイプラインスケジューリング（p1-pipeline-scheduling）

## 背景

コンテンツパイプライン（`p1-content-pipeline.md`）・スカッド取り込み（`p1-squad-ingestion.md`）・試合データ取り込み（`p1-match-ingestion.md`）・生データクリーンアップ（`p1-data-retention.md`）はすべて実装済みだが、Vercel Cron の設定がなく手動実行しか出来ない。本仕様書はこれらを自動化する `vercel.json` と、時刻ベースで対象試合を自動選定するオーケストレーターエンドポイントを定義する。

Six Nations 2027 の試合は週末（土・日）の欧州夕方（UTC 14:45〜21:00）に集中する。日本時間に換算すると深夜〜早朝となるため、通勤時刻までにコンテンツが読める状態にするには T-48h プレビュー / T+1h レビューの自動実行が不可欠。

## スコープ

**対象:**
- `vercel.json` に全 cron スケジュールを追加
- `POST /api/cron/orchestrate` 新規作成（時刻ウィンドウで対象試合を自動選定し、プレビュー・ラインアップ取り込み・レビューを実行）
- `lib/cron/` 配下にオーケストレーターの DB クエリロジックを追加
- `pnpm test` / `pnpm typecheck` / `pnpm lint` グリーン維持

**対象外:**
- Vercel ダッシュボードの設定（`vercel.json` を push すれば自動適用）
- Slack 通知の実体実装（`notifyContentRejected` は stub のまま。`p1-observability.md` で別途）
- 手動バックフィル UI（`docs/runbooks/` に運用手順として別途記載）
- `ingest-fixtures` / `ingest-results` / `ingest-squads` / `cleanup-raw-data` 本体の変更（スケジュールを追加するだけ）

## Cron スケジュール一覧

| エンドポイント | schedule (UTC) | 目的 |
|---|---|---|
| `/api/cron/orchestrate` | `0 * * * *` | プレビュー・ラインアップ・レビューの自動実行（毎時） |
| `/api/cron/ingest-fixtures` | `0 6 * * *` | 試合日程の日次同期（06:00 UTC = 15:00 JST） |
| `/api/cron/ingest-results` | `0 */3 * * *` | スコア・試合状態の 3 時間ごと同期 |
| `/api/cron/ingest-squads` | `0 2 * * 0` | スカッドの週次同期（日曜 02:00 UTC） |
| `/api/cron/cleanup-raw-data` | `0 4 * * *` | 生データの日次クリーンアップ（04:00 UTC） |

`ingest-results` を 3 時間ごとにする理由: Six Nations の試合時間は約 90 分。毎時だと無駄なリクエストが増え、`ingest-results` が 0 件更新を返し続けることになる。3 時間ごとなら試合開始後 3h 以内に `status = 'finished'` を捕捉でき、オーケストレーターが次の毎時実行でレビュー生成を開始する。最悪ケースで試合終了から T+4h（3h + 1h）のレビュー公開。許容範囲内と判断。

## `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/orchestrate",      "schedule": "0 * * * *" },
    { "path": "/api/cron/ingest-fixtures",  "schedule": "0 6 * * *" },
    { "path": "/api/cron/ingest-results",   "schedule": "0 */3 * * *" },
    { "path": "/api/cron/ingest-squads",    "schedule": "0 2 * * 0" },
    { "path": "/api/cron/cleanup-raw-data", "schedule": "0 4 * * *" }
  ]
}
```

Vercel は cron リクエスト時に `Authorization: Bearer ${CRON_SECRET}` ヘッダーを自動付与する（Vercel Cron の仕様）。既存の `lib/cron/auth.ts` の `assertCronAuthorized` がそのまま機能する。

## API サーフェス

### 新規: `POST /api/cron/orchestrate`

配置: `app/api/cron/orchestrate/route.ts`

**処理フロー:**

**Step 1 — プレビュー + ラインアップ取り込み（T-48h）**

対象試合の条件:
```sql
matches.status = 'scheduled'
AND matches.kickoff_at BETWEEN now() + INTERVAL '47 hours'
                            AND now() + INTERVAL '49 hours'
AND NOT EXISTS (
  SELECT 1 FROM match_content
  WHERE match_id = matches.id
    AND content_type = 'preview'
    AND status IN ('draft', 'published')
)
```

各試合に対して並列実行:
1. `ingestLineups(matchId)` を呼び出す（`match_lineups` を更新。Wikipedia URL 未設定なら graceful skip）
2. `generateMatchContent(matchId, 'preview')` を呼び出す

**Step 2 — レビュー（T+1h、`ingest-results` が status を更新済みの想定）**

対象試合の条件:
```sql
matches.status = 'finished'
AND NOT EXISTS (
  SELECT 1 FROM match_content
  WHERE match_id = matches.id
    AND content_type = 'recap'
    AND status IN ('draft', 'published')
)
```

各試合に対して順次実行（並列は LLM コストを跳ね上げるリスクがあるため）:
- `generateMatchContent(matchId, 'recap')` を呼び出す

**レスポンス:**
```json
{
  "previews": { "triggered": 2, "skipped": 0 },
  "lineups": { "triggered": 2, "no_url": 0 },
  "recaps": { "triggered": 1, "skipped": 0 }
}
```

**エラー方針:** 個別試合の失敗は `console.error` でログを残し、他の試合の処理は継続する。エンドポイント全体は 200 を返す（Vercel が 500 を受け取ると cron を無効化することがあるため）。

### `lib/cron/orchestrate.ts`（新規）

オーケストレーターの DB クエリと実行ロジックを `route.ts` から分離して配置する。テスト可能にするため、Supabase クライアントと実行関数を引数で注入できる設計にする。

```typescript
export async function runOrchestrate(deps: {
  db: SupabaseClient
  generateContent: typeof generateMatchContent
  ingestLineups: (matchId: string) => Promise<unknown>
}): Promise<OrchestrateResult>
```

## LLM 連携

なし（本仕様書はスケジューリング層のみ。LLM 呼び出し自体は `p1-content-pipeline.md` で定義済みの `generateMatchContent` を使用）。

## 受け入れ条件

- [ ] `vercel.json` が上記 5 エンドポイントのスケジュールを含む
- [ ] `POST /api/cron/orchestrate`（Bearer 付き）がローカルで 200 を返す
- [ ] `status = 'scheduled'` かつ kickoff が T-47〜49h の試合が存在する場合、`generateMatchContent(id, 'preview')` が呼ばれる
- [ ] 同じ試合に既に `preview` の `match_content`（status が draft/published）がある場合は再生成しない（冪等）
- [ ] `status = 'finished'` かつ `recap` の `match_content` が存在しない試合が存在する場合、`generateMatchContent(id, 'recap')` が呼ばれる
- [ ] `ingest-lineups` が Wikipedia URL 未設定でエラーにならない（graceful skip）
- [ ] 個別試合の `generateMatchContent` 失敗がオーケストレーター全体を止めない
- [ ] `lib/cron/orchestrate.ts` の DB クエリロジックが依存注入経由でテスト可能
- [ ] `tests/cron/orchestrate.test.ts` が以下をカバー:
  - T-48h 対象試合あり → preview + lineup が呼ばれる
  - preview 済み試合 → スキップされる（冪等）
  - finished 試合あり → recap が呼ばれる
  - recap 済み試合 → スキップされる（冪等）
  - 個別試合エラー時に他の試合が処理される
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 実 DB・実 LLM・実ネットワークを叩くテストを含めない

## 決定事項

1. **ingest-results の頻度**: 3 時間ごと。毎時は過剰、試合終了から最悪 T+4h でレビュー公開（許容範囲）
2. **オーケストレーターの並列度**: Step 1（プレビュー・ラインアップ）は並列、Step 2（レビュー）は順次（コスト制御）
3. **エラー時の HTTP ステータス**: 個別試合の失敗でも 200 を返す（Vercel がエラーで cron を止めるリスク回避）
4. **バックフィル**: ローンチ前の全試合一括処理は運用手順書（`docs/runbooks/backfill.md`）に委ねる。本 PR では実装しない

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。
