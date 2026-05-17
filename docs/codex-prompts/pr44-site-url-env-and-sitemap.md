# PR44: サイト URL 環境変数化・sitemap 拡充

## 背景

カスタムドメイン `https://www.trylinerugby.com` への移行に伴い、
コードベース内に `https://tryline-six.vercel.app` がハードコードされている箇所を
環境変数 `NEXT_PUBLIC_SITE_URL` に統一する。

あわせて `app/sitemap.ts` にチームページ・料金ページが未収録なので追加する。

Vercel の Environment Variables には `NEXT_PUBLIC_SITE_URL=https://www.trylinerugby.com` が
すでに設定済み。

## スコープ

対象:
- `lib/site.ts`（新規作成）
- `app/layout.tsx`
- `app/robots.ts`
- `app/sitemap.ts`
- `app/page.tsx`
- `app/matches/[id]/page.tsx`
- `app/t/[team]/page.tsx`
- `app/c/[competition]/page.tsx`
- `app/c/[competition]/[season]/page.tsx`
- `app/api/og/route.tsx`
- `.env.example`

対象外:
- `app/api/stripe/checkout/route.ts`（すでに `NEXT_PUBLIC_SITE_URL ?? fallback` を使用）
- `app/api/stripe/portal/route.ts`（同上）
- デザイン変更

## 変更詳細

### 1. `lib/site.ts` を新規作成

サイト URL を一元管理するファイル。

```typescript
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.trylinerugby.com";
```

### 2. `app/layout.tsx`

```typescript
// 変更前
metadataBase: new URL("https://tryline-six.vercel.app"),

// 変更後
import { SITE_URL } from "@/lib/site";
// ...
metadataBase: new URL(SITE_URL),
```

### 3. `app/robots.ts`

```typescript
// 変更前
sitemap: "https://tryline-six.vercel.app/sitemap.xml",

// 変更後
import { SITE_URL } from "@/lib/site";
// ...
sitemap: `${SITE_URL}/sitemap.xml`,
```

### 4. `app/sitemap.ts`

`base` の変数化、チームページ・料金ページを追加する。

```typescript
import { listAllTeams } from "@/lib/db/queries/teams";
import { SITE_URL } from "@/lib/site";

// 変更前
const base = "https://tryline-six.vercel.app";
const [families, matchIds] = await Promise.all([...]);

// 変更後
const base = SITE_URL;
const [families, matchIds, teams] = await Promise.all([
  listFamilies(),
  listAllMatchIds(),
  listAllTeams(),
]);

// 追加: チームページ
const teamPages = teams.map((team) => ({
  changeFrequency: "weekly" as const,
  lastModified: new Date(),
  priority: 0.7,
  url: `${base}/t/${team.slug}`,
}));

// 追加: 料金ページ
const staticPages = [
  {
    changeFrequency: "monthly" as const,
    lastModified: new Date(),
    priority: 0.5,
    url: `${base}/pricing`,
  },
];

// return に teamPages と staticPages を追加
return [
  { changeFrequency: "daily", lastModified: new Date(), priority: 1, url: base },
  ...familyPages,
  ...seasonPages,
  ...matchPages,
  ...teamPages,
  ...staticPages,
];
```

### 5. 各ページの `openGraph.url` を修正

対象ファイル:
- `app/page.tsx`
- `app/matches/[id]/page.tsx`
- `app/t/[team]/page.tsx`
- `app/c/[competition]/page.tsx`
- `app/c/[competition]/[season]/page.tsx`

各ファイルで:
```typescript
// 変更前（例）
url: `https://tryline-six.vercel.app/matches/${id}`,

// 変更後
import { SITE_URL } from "@/lib/site";
// ...
url: `${SITE_URL}/matches/${id}`,
```

パターンはすべて同じ。`SITE_URL` を import して文字列補間に置き換えるだけ。

### 6. `app/api/og/route.tsx`

OG 画像フッターのドメインテキストを修正。

```typescript
// 変更前
<div style={{ color: "#475569", fontSize: "16px" }}>
  tryline-six.vercel.app
</div>

// 変更後
<div style={{ color: "#475569", fontSize: "16px" }}>
  trylinerugby.com
</div>
```

`route.tsx` は Edge Runtime なので、ここは文字列リテラル `"trylinerugby.com"` でよい。

### 7. `.env.example` に追加

```
NEXT_PUBLIC_SITE_URL=https://www.trylinerugby.com
```

## 受け入れ条件

- `pnpm build` でエラーなし
- `https://www.trylinerugby.com/sitemap.xml` にアクセスするとチームページ・料金ページを含む全ページが列挙される
- X / LINE で試合ページをシェアしたとき OG カードが正しく表示される（`og:url` が `trylinerugby.com`）
- `/robots.txt` の `Sitemap:` 行が `https://www.trylinerugby.com/sitemap.xml` になっている
- コード内に `tryline-six.vercel.app` の文字列が残っていない

## 参考ファイル

- `lib/seo/og-image.ts` — `createOgImage` ヘルパー（変更なし）
- `app/api/og/route.tsx` — OG 画像生成エンドポイント（フッターテキストのみ修正）
- `lib/db/queries/teams.ts` — `listAllTeams()` が `{ slug, name, country }[]` を返す
- `lib/db/queries/matches.ts` — `listAllMatchIds()` が `string[]` を返す（既存）
