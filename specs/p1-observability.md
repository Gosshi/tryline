# Observability（p1-observability）

## 背景

コンテンツパイプライン（`p1-content-pipeline.md`）とオーケストレーター（`p1-pipeline-scheduling.md`）が自動実行されるようになったが、QA で reject されたコンテンツの通知が `console.warn` の stub のままであり、Owner が問題を即座に把握できない。また `pipeline_runs.cost_usd` の累計も確認する手段がなく、異常なコスト増を見落とすリスクがある。

本仕様書は `lib/llm/notify.ts` の stub を Slack webhook の実装に差し替え、コストアラートを追加する。新規 npm パッケージは追加しない（`fetch` で直接叩く）。

## スコープ

**対象:**
- `lib/llm/notify.ts` — `notifyContentRejected` stub を Slack 実装に差し替え、`notifyCostAlert` を追加
- `lib/llm/pipeline.ts` — 累積コスト追跡・`notifyContentRejected` の引数追加・`notifyCostAlert` 呼び出し追加
- `lib/env.ts` — `SLACK_WEBHOOK_URL`（任意）を追加
- `.env.example` — `SLACK_WEBHOOK_URL` を追記
- テスト更新（`tests/llm/pipeline.test.ts` のモック追随）

**対象外:**
- Sentry 連携（npm レジストリ制約のため Phase 2 以降）
- コスト集計ダッシュボード UI
- Slack チャンネルの作成・管理
- `pipeline_runs` テーブルのスキーマ変更
- メール通知

## 環境変数

```
# Slack Incoming Webhook URL（任意。未設定の場合は通知をスキップ）
SLACK_WEBHOOK_URL=
```

`lib/env.ts` の `serverEnvSchema` に以下を追加:

```typescript
SLACK_WEBHOOK_URL: z.string().url().optional(),
```

`SLACK_WEBHOOK_URL` が未設定または空文字の場合、notify 関数はエラーを投げず `console.warn` のみ出力して終了する（Phase 1 運用の初期は未設定でも動作を壊さないため）。

## `lib/llm/notify.ts` の変更

### `notifyContentRejected`（シグネチャ変更 + 実装）

現在の stub に `qaResult: QaResult` 引数を追加し、Slack メッセージを送信する。

```typescript
export async function notifyContentRejected(
  matchId: string,
  contentType: ContentType,
  qaResult: QaResult,
): Promise<void>
```

Slack メッセージ本文（`{"text": "..."}` 形式）:

```
⚠️ コンテンツ却下 [${contentType}]
試合ID: ${matchId}
QAスコア: 情報密度 ${scores.information_density}/5 / 日本語品質 ${scores.japanese_quality}/5 / 事実根拠 ${scores.factual_grounding}/5
問題点: ${issues.join(" / ")}
対応: Supabase Studio の match_content テーブルで status を確認し、必要に応じて published に変更してください
```

### `notifyCostAlert`（新規追加）

```typescript
export async function notifyCostAlert(
  matchId: string,
  contentType: ContentType,
  totalCostUsd: number,
  thresholdUsd: number,
): Promise<void>
```

Slack メッセージ本文:

```
💸 コストアラート [${contentType}]
試合ID: ${matchId}
累積コスト: $${totalCostUsd.toFixed(4)}（閾値: $${thresholdUsd}）
pipeline_runs テーブルを確認し、異常なトークン消費がないか調査してください
```

### 共通実装方針

- `SLACK_WEBHOOK_URL` が取得できない（未設定）場合は `console.warn` のみ出して `return`
- Slack への `fetch` が失敗した場合は `console.error` でログを残し、例外を re-throw **しない**（通知失敗でパイプライン本体を止めないため）
- User-Agent ヘッダは付与しない（Slack webhook は不要）

## `lib/llm/pipeline.ts` の変更

### 1. 累積コスト追跡

`generateMatchContent` 内に `let totalCostUsd = 0` を追加し、各段階の `calculateCostUsd()` の戻り値を加算する:

- 段階 2（事実抽出）: `totalCostUsd += calculateCostUsd({...})`
- 段階 3（ナラティブ）: `totalCostUsd += calculateCostUsd({...})` ← リトライのたびに加算
- 段階 4（QA）: `totalCostUsd += calculateCostUsd({...})` ← リトライのたびに加算

### 2. `notifyContentRejected` 呼び出し箇所の変更

```typescript
// 変更前
await notifyContentRejected(matchId, contentType);

// 変更後
await notifyContentRejected(matchId, contentType, finalQa);
```

### 3. `notifyCostAlert` 呼び出し追加

`match_content` への upsert が完了した後、コスト閾値チェックを実行:

```typescript
const COST_ALERT_THRESHOLD_USD = 0.20;

if (totalCostUsd > COST_ALERT_THRESHOLD_USD) {
  await notifyCostAlert(matchId, contentType, totalCostUsd, COST_ALERT_THRESHOLD_USD);
}
```

## UI サーフェス

なし。

## LLM 連携

なし（本仕様書は通知層のみ）。

## 受け入れ条件

- [ ] `SLACK_WEBHOOK_URL` が未設定でも `pnpm test` が通る（通知はスキップされる）
- [ ] `notifyContentRejected` の引数が `(matchId, contentType, qaResult)` に変わり、pipeline.ts の呼び出し側が追随している
- [ ] `notifyCostAlert` が `lib/llm/notify.ts` に追加されている
- [ ] `generateMatchContent` が段階 2・3・4 の `costUsd` を累積し、`totalCostUsd` を持つ
- [ ] `totalCostUsd > 0.20` の試合で `notifyCostAlert` が呼ばれる
- [ ] `totalCostUsd <= 0.20` の試合で `notifyCostAlert` が呼ばれない
- [ ] `SLACK_WEBHOOK_URL` が設定されている場合、`notifyContentRejected` が Slack に `fetch` POST する
- [ ] Slack への `fetch` 失敗時にパイプラインが例外を投げない（`console.error` のみ）
- [ ] `tests/llm/notify.test.ts` が新規作成され、以下をカバーする:
  - `SLACK_WEBHOOK_URL` 未設定時にスキップされる
  - `SLACK_WEBHOOK_URL` 設定時に正しい URL / ボディで `fetch` が呼ばれる
  - `fetch` 失敗時に例外が伝播しない
- [ ] `tests/llm/pipeline.test.ts` が `notifyContentRejected` の新シグネチャに追随している
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 実 Slack webhook を叩くテストを含めない

## 決定事項

1. **Sentry**: npm レジストリ制約のため Phase 2 以降。本 PR では対象外
2. **コスト閾値**: $0.20 固定（D010 準拠）。env var 化は不要（変更時は定数を書き換える）
3. **Slack 失敗時の挙動**: 例外を投げない。パイプライン本体を通知失敗で止めない
4. **`SLACK_WEBHOOK_URL` の任意化**: 未設定でもパイプラインが動作する。Phase 1 初期は設定なしで運用可

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。
