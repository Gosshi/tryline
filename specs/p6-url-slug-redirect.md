# 大会シーズン URL スラッグ 301 リダイレクト

## 背景

外部リンクや古いブックマークなどから
`/c/premiership/premiership-2024-25` のような「大会名プレフィックス付き」URL で
アクセスすると 404 になる。正しい URL は `/c/premiership/2024-25` である。

旧スラッグ形式の URL を 301 リダイレクトで正しい URL に転送することで
SEO 評価の損失とユーザーの 404 を防ぐ。

## スコープ

対象:
- `/c/[family]/[season]` ルートの URL スラッグ変換

対象外:
- DB 上のスラッグ値の変更
- 他のページ（`/matches/[id]` など）のリダイレクト

## 変更内容

### リダイレクトパターン

旧スラッグが `{family}-{slug}` 形式（例: `premiership-2024-25`）の場合、
先頭の `{family}-` を取り除いた `/c/{family}/{slug}` に 301 リダイレクトする。

| リクエスト | リダイレクト先 |
|-----------|--------------|
| `/c/premiership/premiership-2024-25` | `/c/premiership/2024-25` |
| `/c/urc/urc-2025-26` | `/c/urc/2025-26` |
| `/c/top-14/top-14-2025-26` | `/c/top-14/2025-26` |
| `/c/six-nations/six-nations-2025` | `/c/six-nations/2025` |

### 実装方針 A: `next.config.ts` に静的リダイレクト追加（推奨）

```ts
// next.config.ts
const redirects = async () => [
  { source: '/c/premiership/premiership-:slug',       destination: '/c/premiership/:slug',        permanent: true },
  { source: '/c/urc/urc-:slug',                       destination: '/c/urc/:slug',                permanent: true },
  { source: '/c/top-14/top-14-:slug',                 destination: '/c/top-14/:slug',             permanent: true },
  { source: '/c/six-nations/six-nations-:slug',       destination: '/c/six-nations/:slug',        permanent: true },
  { source: '/c/rugby-championship/rugby-championship-:slug', destination: '/c/rugby-championship/:slug', permanent: true },
  { source: '/c/super-rugby/super-rugby-:slug',       destination: '/c/super-rugby/:slug',        permanent: true },
  { source: '/c/league-one/league-one-:slug',         destination: '/c/league-one/:slug',         permanent: true },
  { source: '/c/autumn-nations/autumn-nations-:slug', destination: '/c/autumn-nations/:slug',     permanent: true },
  { source: '/c/nations-cup/nations-cup-:slug',       destination: '/c/nations-cup/:slug',        permanent: true },
];
```

### 実装方針 B: サーバーサイドリダイレクト（代替）

```ts
// app/c/[family]/[season]/page.tsx
import { redirect } from 'next/navigation';

if (season.startsWith(`${family}-`)) {
  redirect(`/c/${family}/${season.slice(family.length + 1)}`);
}
```

方針 A（静的リダイレクト）を推奨する。エッジで処理されるためアプリサーバーを経由しない。

## 変更ファイル

- `next.config.ts`（方針 A の場合）
- または `app/c/[family]/[season]/page.tsx`（方針 B の場合）

## 受け入れ条件

- [ ] `/c/premiership/premiership-2024-25` へのアクセスが 301 で `/c/premiership/2024-25` にリダイレクトされる
- [ ] 全大会（Premiership / URC / Top 14 / Six Nations / Rugby Championship / Super Rugby / League One / Autumn Nations / Nations Cup）で動作する
- [ ] 正しいスラッグ（`/c/premiership/2024-25`）へのアクセスはリダイレクトされない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. `nations-cup` など family に複数ハイフンが含まれる場合に方針 B で `slice` が正しく動くか確認
2. 旧スラッグ形式の流入量（Vercel アクセスログ）を確認して優先度を再評価
