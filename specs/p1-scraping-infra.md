# スクレイピング基盤（p1-scraping-infra）

## 背景

`CLAUDE.md` の設計不変条件として「robots.txt は常に尊重、レート制限を守り、積極的にキャッシュする」が定められています。`docs/architecture.md` でも「すべてのスクレイパーは取得前に robots.txt を確認する、ドメインあたり 1 リクエスト / 3 秒」と明文化されています。

今後 Rugby Championship 取り込み・Reddit スレッド取り込み等、複数のスクレイパーが並行して実装されるため、これらのポリシーを各スクレイパーに重複実装させず、共通モジュールに集約します。本仕様書はその共通基盤（`lib/scrapers/` 配下のユーティリティ）のみを対象とし、実際のソース別スクレイパーは扱いません。

## スコープ

対象:
- `lib/scrapers/` 配下の共通ユーティリティ
- robots.txt チェック（キャッシュ付き）
- ドメイン別レート制限
- User-Agent とタイムアウトを強制する HTTP fetcher
- 指数バックオフによるリトライ
- カスタムエラー型
- 生データ保存ヘルパー（`match_raw_data` への upsert）
- 単体テスト

対象外:
- ソース別スクレイパー本体（`p1-match-ingestion.md` 等で別途定義）
- cron スケジューラ・API ルート（スクレイパー側で定義）
- HTML パース（`cheerio` を使うが利用側の責務）
- 型定義済みの抽象スクレイパー基底クラス（過剰抽象を避ける。関数合成で十分）
- Reddit API 固有のクライアント（認証等が別問題なので分離）

## 依存パッケージ

`p0-foundation.md` の技術選定を踏襲し、以下を新規追加する:

- `robots-parser` — robots.txt パース
- `cheerio` — HTML パース（利用側で使うが `package.json` に加えておく）

追加しない:
- `axios`（標準の `fetch` で十分）
- `p-limit`（レート制限は自前実装で OK、ロジックが単純）
- `node-cache` / `redis`（robots.txt のキャッシュは in-memory Map で足りる）

## モジュール構成

```
/lib/scrapers
  robots.ts       — robots.txt の取得・キャッシュ・判定
  rate-limit.ts   — ドメイン別の非同期キュー
  fetcher.ts      — robots + rate-limit + リトライを適用した fetch ラッパー
  errors.ts       — カスタムエラー型
  raw-data.ts     — match_raw_data への保存ヘルパー
  index.ts        — 公開 API の再エクスポート
```

## API サーフェス

### `lib/scrapers/errors.ts`

```typescript
export class RobotsDisallowedError extends Error { url: string }
export class RateLimitedError extends Error { domain: string; retryAfter?: number }
export class FetchError extends Error { url: string; status?: number; attempt: number }
```

### `lib/scrapers/robots.ts`

```typescript
export async function isAllowed(
  url: string,
  userAgent: string
): Promise<boolean>
```

- robots.txt は URL の origin ごとにキャッシュ（in-memory、TTL 24 時間）
- robots.txt の取得失敗（404 / ネットワークエラー）は「許可」として扱う（一般的な挙動）
- キャッシュは起動中のみ保持されればよい（プロセス間共有は不要）

### `lib/scrapers/rate-limit.ts`

```typescript
export async function acquireSlot(
  domain: string,
  minIntervalMs?: number
): Promise<void>
```

- ドメインごとに直近リクエスト時刻を保持し、`minIntervalMs` 未満の間隔で呼ばれたら待機
- デフォルト間隔: `3000ms`（`docs/architecture.md` 準拠）
- 戻り値は `void`。取得できるまで `await` する

### `lib/scrapers/fetcher.ts`

```typescript
export interface FetchPolicyOptions {
  minIntervalMs?: number          // デフォルト 3000
  timeoutMs?: number              // デフォルト 15000
  maxRetries?: number             // デフォルト 3
  skipRobotsCheck?: boolean       // デフォルト false
  headers?: Record<string, string>
}

export async function fetchWithPolicy(
  url: string,
  options?: FetchPolicyOptions
): Promise<Response>
```

処理順序:
1. `isAllowed(url, userAgent)` → false なら `RobotsDisallowedError`
2. `acquireSlot(domain, minIntervalMs)` で待機
3. `fetch(url)` を `AbortController` + `timeoutMs` で実行
4. User-Agent ヘッダは `SCRAPER_USER_AGENT` 環境変数（`lib/env.ts` 経由）を自動付与
5. 5xx / ネットワークエラーなら指数バックオフ（1s, 2s, 4s...）でリトライ
6. 4xx（404, 403 等）はリトライせず `FetchError`
7. 429 は `Retry-After` ヘッダがあれば尊重、なければ指数バックオフ

### `lib/scrapers/raw-data.ts`

```typescript
export async function saveRawData(params: {
  matchId: string
  source: string
  sourceUrl: string
  payload: unknown
}): Promise<void>
```

- `match_raw_data` に insert（`expires_at` は DB デフォルトに任せる）
- service role client を使用（`lib/db/server.ts`）
- 同じ `(match_id, source, source_url)` の重複 insert は **許容**（履歴として残す）。upsert はしない

### `lib/scrapers/index.ts`

上記の公開関数とエラー型を再エクスポートする。利用側は `import { fetchWithPolicy, RobotsDisallowedError } from '@/lib/scrapers'` で済む。

## 環境変数

`p0-foundation.md` で既定義の `SCRAPER_USER_AGENT` を使用。`lib/env.ts` でバリデーション済みの前提。本 PR では環境変数を追加しない。

## ログとエラーハンドリング

- `fetchWithPolicy` はログを直接出さず、呼び出し側の責務とする（MVP では `console.warn` / `console.error` で可）
- エラーは throw するのが基本。`try/catch` で握り潰して Promise を resolve するパターンは避ける
- リトライ中の警告だけ内部で `console.warn` してよい

## API サーフェス（HTTP）

なし。本モジュールはサーバー専用ライブラリ。API ルートや cron は追加しない。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

- [ ] `pnpm install` 後に新規依存（`robots-parser`, `cheerio`）が追加されている
- [ ] `lib/scrapers/` 配下に上記 6 ファイルが存在し、`index.ts` が公開 API を再エクスポートする
- [ ] `fetchWithPolicy` は以下の順序で動作することを単体テストで検証:
  - robots.txt で disallowed → `RobotsDisallowedError`、実リクエスト無し
  - 許可済み → rate limit 待機 → 実リクエスト → レスポンス返却
- [ ] `acquireSlot` が同一ドメイン連続呼び出しで `minIntervalMs` の待機を入れることをテスト（fake timer 可）
- [ ] 5xx 時に指数バックオフでリトライし、`maxRetries` 超過で `FetchError` を投げることをテスト
- [ ] 4xx はリトライしないことをテスト
- [ ] robots.txt の取得が 404 の場合は「許可」扱いになることをテスト
- [ ] `saveRawData` が `match_raw_data` に insert し、`expires_at` が未指定でも 7 日後に設定されることをテスト（`p1-data-model.md` のデフォルト依存）
- [ ] User-Agent ヘッダに `SCRAPER_USER_AGENT` の値が自動付与されることをテスト
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 実ネットワークを叩くテストは含めない（全てモック）

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。
