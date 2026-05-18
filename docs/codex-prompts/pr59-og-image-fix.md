# PR59: OG 画像の修正

## 背景

現状、`/api/og` の試合カードテンプレートがホーム・チーム・競技ページにも流用されており、
SNS でシェアした際に「海外ラグビーを日本語で深掘り **vs** Tryline」のような意味不明な表示になっている。

また試合ページの OG 画像もテキストのみでビジュアルが弱い。

## スコープ

対象:
- `public/og-image.png` — 静的 OG 画像を新規配置（後述）
- `app/api/og/route.tsx` — 試合ページ用デザイン改善
- `lib/seo/og-image.ts` — 不要なデフォルト値を削除してシンプル化
- `app/page.tsx` — 静的 OG に差し替え
- `app/t/[team]/page.tsx` — 静的 OG に差し替え
- `app/c/[competition]/page.tsx` — 静的 OG に差し替え
- `app/c/[competition]/[season]/page.tsx` — 静的 OG に差し替え

対象外:
- `app/matches/[id]/page.tsx` — 現行の動的 OG を維持（試合ページのみ `/api/og` を使う）
- `app/layout.tsx` — 変更なし

---

## Part A: 静的 OG 画像の配置

`public/og-image.png` に 1200×630 の静的 OG 画像を配置する。

画像は Owner が別途用意する（`img/x_header.png` を 1200×630 にリサイズしたもの）。
Codex はこのファイルが存在する前提でコードを書くこと。

---

## Part B: ホーム・チーム・競技ページを静的 OG に差し替え

### `app/page.tsx`

```typescript
// Before
import { createOgImage } from "@/lib/seo/og-image";

images: [
  createOgImage({
    competition: "Tryline",
    home: "海外ラグビーを日本語で深掘り",
  }),
],

// After
images: [
  {
    url: `${SITE_URL}/og-image.png`,
    width: 1200,
    height: 630,
  },
],
```

`createOgImage` のインポートも削除する。

### `app/t/[team]/page.tsx`

```typescript
// Before
images: [
  createOgImage({
    competition: "Team",
    home: teamData.name,
  }),
],

// After
images: [
  {
    url: `${SITE_URL}/og-image.png`,
    width: 1200,
    height: 630,
  },
],
```

`createOgImage` のインポートも削除する。

### `app/c/[competition]/page.tsx`

```typescript
// Before
images: [
  createOgImage({
    competition: "Tryline",
    home: name,
  }),
],

// After
images: [
  {
    url: `${SITE_URL}/og-image.png`,
    width: 1200,
    height: 630,
  },
],
```

`createOgImage` のインポートも削除する。

### `app/c/[competition]/[season]/page.tsx`

```typescript
// Before
images: [
  createOgImage({
    competition: formatFamilyName(comp.family),
    home: title,
  }),
],

// After
images: [
  {
    url: `${SITE_URL}/og-image.png`,
    width: 1200,
    height: 630,
  },
],
```

`createOgImage` のインポートも削除する。

---

## Part C: `lib/seo/og-image.ts` のシンプル化

試合ページ専用のユーティリティであることを明確にし、不要なデフォルト値を除去する。

```typescript
type OgImageParams = {
  away: string;
  competition: string;
  home: string;
  score?: string;
  status?: string;
};

export function createMatchOgImage(params: OgImageParams) {
  const searchParams = new URLSearchParams({
    away: params.away,
    competition: params.competition,
    home: params.home,
  });

  if (params.score) searchParams.set("score", params.score);
  if (params.status) searchParams.set("status", params.status);

  return {
    height: 630,
    url: `/api/og?${searchParams.toString()}`,
    width: 1200,
  };
}
```

関数名を `createOgImage` → `createMatchOgImage` に変更する。
`app/matches/[id]/page.tsx` 内のインポートと呼び出しも合わせて更新する。

---

## Part D: `/api/og` 試合ページ OG のデザイン改善

`app/api/og/route.tsx` を以下の方針でリデザインする。

### デザイン要件

- 背景: 上部 `#0B1628`（濃いネイビー）→ 下部 `#0f172a` の微妙なグラデーション
- 左端に幅 6px の緑（`#22c55e`）のアクセントバー
- 上部に `Tryline` ロゴ（小・右上）と競技名タグ（左上・グレー背景の pill）
- 中央に チーム名 vs/スコア の構成（現行と同じ）
- チーム名フォントサイズを 64px に拡大
- スコアの緑色（`#22c55e`）はそのまま維持
- 下部に `trylinerugby.com` のウォーターマーク（右下）
- フォントは Google Fonts の Inter を fetch して使用（日本語チーム名は現状維持・システムフォントにフォールバック）

### Inter フォントの読み込み

```typescript
const interFont = await fetch(
  "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2"
).then((res) => res.arrayBuffer());
```

`ImageResponse` の第二引数に `fonts` を渡す:

```typescript
return new ImageResponse(
  (...),
  {
    height: 630,
    width: 1200,
    fonts: [
      {
        name: "Inter",
        data: interFont,
        style: "normal",
        weight: 700,
      },
    ],
  }
);
```

`fontFamily` を `"Inter, sans-serif"` に変更する。

### レイアウト構造（JSX イメージ）

```
┌─────────────────────────────────────────────────────────┐
│▌ [Rugby Championship 2025]               Tryline         │  ← 上部バー
│                                                           │
│                                                           │
│         South Africa    32-15    Australia                │  ← 中央（大）
│                                                           │
│                                                           │
│                                          trylinerugby.com │  ← 下部
└─────────────────────────────────────────────────────────┘
 ▌ = 左端 6px 緑バー
```

---

## 受け入れ条件

- ホームページを X / Slack / LINE でシェアすると OG 画像が `og-image.png` の静的画像で表示される
- 試合ページをシェアすると `チーム名 スコア チーム名` の OG 画像が表示される（既存動作維持）
- `/api/og?home=South+Africa&away=Australia&score=32-15&competition=Rugby+Championship+2025` にアクセスすると改善されたデザインが表示される
- TypeScript の型エラーなし
- `pnpm build` でエラーなし

## 参考ファイル

- `app/api/og/route.tsx` — 変更対象（現行実装参照）
- `lib/seo/og-image.ts` — 変更対象（現行実装参照）
- `app/matches/[id]/page.tsx` — `createMatchOgImage` へのリネーム対応
- `app/page.tsx` / `app/t/[team]/page.tsx` / `app/c/[competition]/page.tsx` / `app/c/[competition]/[season]/page.tsx` — 静的 OG への差し替え
