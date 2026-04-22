# 基盤セットアップ（p0-foundation）

## 背景

Tryline の Phase 1 開発は 2026年8月の Rugby Championship ローンチに向けて進行します。以後の全仕様書（`p1-content-pipeline.md` 等）が前提とする、Next.js + Supabase + Claude API の実装基盤を先に整備する必要があります。本仕様書は、Codex がゼロから動くスケルトンを構築するための受け入れ基準を定めます。

この基盤が完成した段階では、ビジネスロジックは含まれていません。以降の機能仕様書が「このプロジェクトの上に載る」ための土台のみを提供します。

## スコープ

対象:
- Next.js 15 App Router プロジェクト（TypeScript strict）
- パッケージマネージャ: pnpm
- Tailwind CSS + shadcn/ui の初期導入
- Supabase ローカル開発環境（`supabase/` ディレクトリ、CLI）
- Supabase クライアント（サーバー用・クライアント用の両方）
- Claude API クライアント（Anthropic SDK ラッパー、モデル選択ヘルパー）
- 共通ディレクトリ構造の作成（`CLAUDE.md` の規定に従う）
- 環境変数ローダー（zod で型安全化）
- Lint / Format / TypeCheck の標準構成
- テスト基盤（Vitest）
- CI（GitHub Actions）: lint + typecheck + test
- ヘルスチェック API ルート（Supabase 接続・Claude API 接続確認）

対象外:
- 認証 UI（Phase 1 の別仕様書で定義）
- 本番用マイグレーション、本番テーブル（Match 等）
- スクレイパー実装
- LLM パイプライン実装
- Stripe 実装（Phase 2）
- E2E テスト（Phase 1 後半に別仕様書で追加検討）
- Sentry 等の監視ツール（Phase 1 中盤で別途導入）

## ディレクトリ構造

`CLAUDE.md` に従い以下を作成する。空ディレクトリは `.gitkeep` を置く。

```
/app
  /api
    /health/route.ts        — ヘルスチェックエンドポイント
  layout.tsx
  page.tsx                  — 仮のトップページ（Tryline ロゴ + "準備中"）
/components
  /ui                       — shadcn/ui 生成コンポーネント
/lib
  /db
    client.ts               — ブラウザ用 Supabase クライアント
    server.ts               — サーバー用 Supabase クライアント（service role 分離）
    types.ts                — 自動生成型の re-export（空でコミット）
  /llm
    client.ts               — Anthropic SDK ラッパー
    models.ts               — モデル ID 定数（HAIKU / SONNET）
  /env.ts                   — zod による環境変数バリデーション
/specs                      — 既存維持
/docs                       — 既存維持
/supabase
  /migrations               — 空（最初のマイグレーションは別仕様書で）
  config.toml               — supabase init で生成
/public                     — 空
```

## 技術選定

| レイヤー | 選定 | 理由 |
|---------|------|------|
| フロント | Next.js 15 (App Router, RSC) | `D001` で決定済み |
| DB / Auth | Supabase | `D002` で決定済み |
| LLM | Anthropic SDK (@anthropic-ai/sdk) | Claude API 公式 |
| パッケージマネージャ | pnpm | README で既定 |
| Linter | ESLint (next/core-web-vitals + strict) | Next.js 標準 |
| Formatter | Prettier | `tailwindcss-prettier-plugin` 同梱 |
| テスト | Vitest + @testing-library/react | Next.js 15 との親和性、ESM ネイティブ |
| 環境変数 | zod | 起動時の型安全バリデーション |
| UI | Tailwind CSS + shadcn/ui | `CLAUDE.md` で既定 |
| ORM | 不採用。supabase-js + 生成型 | `CLAUDE.md`「型付きクエリ」の方針 |

## API サーフェス

### `GET /api/health`

開発時の疎通確認用。本番では後続の仕様書で非公開化する。

レスポンス:
```json
{
  "status": "ok",
  "checks": {
    "supabase": "ok" | "error",
    "anthropic": "ok" | "error"
  },
  "version": "<git sha>",
  "timestamp": "<iso8601>"
}
```

- Supabase チェック: anon client で `select 1` 相当
- Anthropic チェック: モデル一覧取得 or 最小 Haiku 呼び出し（コスト最小化のため、起動時のキー有無のみ確認でも可）

## UI サーフェス

`app/page.tsx` に仮のランディングページ。`Tryline` のタイトル + `準備中です` の 1 行。Tailwind + shadcn/ui の `Button` を配置して動作確認する。これは後続仕様書で全面的に書き直す前提。

## LLM 連携

本仕様書では SDK セットアップのみ。プロンプトテンプレートやパイプラインは `p1-content-pipeline.md` が担当。

`/lib/llm/client.ts` は以下を公開する:

```typescript
export function getAnthropicClient(): Anthropic
export const MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-6',
} as const
```

## 設定ファイル

### `package.json` scripts（必須）

- `dev` — Next.js dev
- `build` — Next.js build
- `start` — Next.js start
- `lint` — ESLint
- `format` — Prettier write
- `typecheck` — `tsc --noEmit`
- `test` — Vitest
- `supabase:start` — `supabase start`
- `supabase:types` — `supabase gen types typescript --local > lib/db/types.ts`

### `tsconfig.json`

- `strict: true`
- `noUncheckedIndexedAccess: true`
- path alias: `@/*` → プロジェクトルート

### `.eslintrc` / `.prettierrc`

Next.js デフォルト + Prettier 連携。`import/order` ルールを有効化。

### `.gitignore` 追加

- `.env.local`
- `.next/`
- `node_modules/`
- `supabase/.temp/`
- `lib/db/types.ts` は generated として扱い、**コミットする**（CI で diff チェック）

### GitHub Actions `.github/workflows/ci.yml`

main への PR で起動:
1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`

ビルドは Vercel 側で実施するため CI では行わない。

## 受け入れ条件

- [ ] `pnpm install && pnpm dev` でトップページが 3000 番ポートで表示される
- [ ] `pnpm supabase start` でローカル Supabase が起動する
- [ ] `.env.example` を `.env.local` にコピーして仮の値を入れた状態で、`/api/health` が 200 を返す（Supabase/Anthropic のキーが空の場合は `checks` が `error` を返すが、ルート自体は 200）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` がすべて成功する（テストはスモーク 1 本でよい: 環境変数ローダーの zod エラーハンドリング）
- [ ] `/lib/env.ts` で `ANTHROPIC_API_KEY` 等の必須変数が欠落している場合、アプリが起動時に明示的エラーで終了する
- [ ] `CLAUDE.md` に記載のディレクトリ構造が存在する（空ディレクトリは `.gitkeep`）
- [ ] GitHub Actions の CI が main への PR で緑になる
- [ ] Claude Code / Codex 以外のシークレット（`.env.local` 実体）がコミットされていない
- [ ] `README.md` のローカルセットアップ手順が実際にそのまま動く

## 決定事項（旧「未解決の質問」からの確定）

Owner 決定（2026-04-22）。以下は Codex への指示として扱う。

1. **ホスティング**: 本 PR は **ローカル開発環境のみ**。Vercel / 本番 Supabase との連携は後続 PR で行う（対象外）
2. **Supabase**: **ローカルのみ**（`supabase start`）。staging プロジェクトはこの PR では作成しない
3. **shadcn/ui 初期セット**: **Button / Input / Card の 3 点のみ**導入。他は必要になった時点で追加
4. **`lib/db/types.ts`**: **コミットする**。CI に diff チェックは含めない（MVP では手動再生成で運用）
5. **Node.js バージョン**: **Node 20 LTS**。`.nvmrc` と `package.json` の `engines.node` 両方で固定
6. **CI キャッシュ**: `pnpm/action-setup@v4` + `actions/setup-node@v4` の `cache: 'pnpm'` 組み合わせ

## 未解決の質問

現時点なし。疑問が生じた場合は Codex が実装前に Owner に確認する。
