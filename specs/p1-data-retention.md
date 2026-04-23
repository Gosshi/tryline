# 生データ保持期間管理（p1-data-retention）

## 背景

`p1-scraping-infra.md` で `match_raw_data` に `expires_at` カラム（デフォルト 7 日後）を設け、「7 日経過した生データは削除する」方針を明記しましたが、実際に期限切れ行を削除する cron は未実装のまま後続仕様に委ねられていました。本仕様書はその cron を実装対象にします。

クリーンアップを怠ると `match_raw_data.payload`（生 HTML / JSON）が無制限に蓄積し、Supabase ストレージコスト・バックアップサイズ・RLS 越しの read パフォーマンスに悪影響が出ます。また `CLAUDE.md`「設計の不変条件」の「スクレイプした生テキストは決して再配信しない」方針と整合的に、不要になった生データは保持しない運用を徹底します。

## スコープ

対象:
- cron エンドポイント `POST /api/cron/cleanup-raw-data` の実装
- `CRON_SECRET` による Bearer 認可（既存の `lib/cron/auth.ts` を流用）
- `match_raw_data` の期限切れ行（`expires_at < now()`）の物理削除
- 削除件数と実行時間のレスポンス
- 単体テスト（認可・削除対象の絞り込み）

対象外:
- `matches` / `match_events` / `match_content` 等、`match_raw_data` 以外のテーブルの保持期間管理（本 PR では手を付けない）
- 論理削除（soft delete）列の追加
- `expires_at` のカラム変更・デフォルト値変更（`p1-data-model.md` のスキーマは維持）
- Vercel Cron の設定ファイル（`vercel.json`）追加（`p0-foundation.md` で Vercel 連携は対象外）
- S3 / オブジェクトストレージへの退避
- 削除件数の永続ログ（`console.info` 程度、永続化は後続仕様書）
- 管理画面 UI

## データモデル変更

**なし**。`match_raw_data.expires_at` は既存カラム（`p1-data-model.md` で定義済み、デフォルト `now() + interval '7 days'`）。

## モジュール構成

```
/app/api/cron
  cleanup-raw-data/route.ts   — POST cron エンドポイント
/lib/retention
  cleanup-raw-data.ts         — 削除ロジック（route.ts から呼ぶ）
```

既存の `lib/cron/auth.ts` と `lib/db/server.ts`（service role クライアント）を流用。新規ヘルパーは追加しない。

## API サーフェス

### `POST /api/cron/cleanup-raw-data`

- 認可: `Authorization: Bearer <CRON_SECRET>`（`assertCronAuthorized` を使用）
- Body: なし
- 処理:
  1. `lib/db/server.ts` の service role クライアントで `delete from match_raw_data where expires_at < now()` を実行
  2. 削除件数を取得（Supabase の `.select('id')` / `count` オプション）
  3. 処理開始〜終了の経過時間を記録
- 成功レスポンス:

```json
{
  "status": "ok",
  "deleted_rows": 42,
  "duration_ms": 87
}
```

- 認可失敗時のレスポンス: 401 / `{ "error": "unauthorized" }`（既存 cron と一致させる）
- DB エラー時: 500 / `{ "error": "internal_error" }`。エラー詳細は `console.error` のみに出し、レスポンスには含めない

### 削除ロジックの分離

`lib/retention/cleanup-raw-data.ts`:

```typescript
export async function cleanupExpiredRawData(): Promise<{
  deletedRows: number;
  durationMs: number;
}>;
```

- route ハンドラは認可のみ行い、本体はこの関数に委譲
- Supabase client は引数で受けず、関数内で `getServiceRoleClient()` を取得（既存の cron 実装パターンに揃える）

## 冪等性

- 削除は `expires_at < now()` 条件のみで、連続実行しても重複動作にならない（2 回目以降は `deleted_rows = 0`）
- 排他制御は不要（Supabase の DELETE は行レベルロック、同時実行しても片方が 0 件になるだけ）

## スケジューリング

本 PR では Vercel Cron の設定ファイルは追加しない（`p0-foundation.md` 方針）。Owner がローカルで `curl` で動作確認できる状態を目指す。

将来 Vercel Cron を設定する際の目安:
- 実行頻度: 1 日 1 回（UTC 03:00 など低トラフィック帯）
- 失敗時の再試行は不要（次回実行で吸収される）

## ログ

- 成功時: `console.info('[cleanup-raw-data] deleted=%d duration_ms=%d', deletedRows, durationMs)`
- エラー時: `console.error('[cleanup-raw-data] failed', error)`
- 永続化は本 PR では行わない（`p1-scraping-infra` と同じスタンス）

## テスト戦略

- `tests/retention/cleanup-raw-data.test.ts`:
  1. `match_raw_data` に `expires_at` が過去の行と未来の行を 2 件ずつ insert → `cleanupExpiredRawData()` 実行後、過去行のみ削除され未来行は残ることを検証（Supabase ローカル）
  2. `match_raw_data` が空の状態で実行 → `deletedRows = 0` で成功すること
- `tests/api/cleanup-raw-data.test.ts`:
  1. 認可ヘッダなし → 401
  2. 正しい Bearer → 200 とレスポンス JSON の shape（`deleted_rows` と `duration_ms` が number）
  3. `cleanupExpiredRawData` を `vi.mock` で失敗させた場合 → 500 / `{ "error": "internal_error" }`
- 実ネットワークを叩くテストは作らない（Wikipedia / Reddit への実フェッチは本仕様書の対象外）

## 環境変数

**追加なし**。`CRON_SECRET` は既に `.env.example` / `lib/env.ts` に存在する前提（`p1-match-ingestion` で追加済み）。

## 依存パッケージ

**追加なし**。

## 受け入れ条件

- [ ] `POST /api/cron/cleanup-raw-data` が Bearer 無しで 401、正しい値で 200 を返す
- [ ] `expires_at < now()` の行のみが削除され、未来 `expires_at` の行は残る
- [ ] レスポンスに `deleted_rows`（number）と `duration_ms`（number）が含まれる
- [ ] 空テーブル状態で実行しても成功し、`deleted_rows = 0` になる
- [ ] `lib/cron/auth.ts` を経由している（認可ロジックを再実装していない）
- [ ] `lib/db/server.ts` の service role クライアントを使用している（anon クライアントではない）
- [ ] `match_raw_data` 以外のテーブルへの書き込みがない
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 単体テスト（上記「テスト戦略」）が全て成功
- [ ] `supabase/migrations/` に新規マイグレーションが追加されていない
- [ ] `.env.example` / `lib/env.ts` / `package.json` に差分が無い（本 PR は追加依存なし）

## 未解決の質問

1. 削除された行の監査ログ（誰がいつどれだけ消したか）を将来どこに保存するか — 本 PR は `console.info` のみとし、永続ログが必要になった時点で別 PR で検討（pipeline_runs のような専用テーブルを流用する方向性になる見込み）
