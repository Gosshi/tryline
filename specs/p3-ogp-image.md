# p3-ogp-image: OGP 画像の設定

## 背景

`app/api/og/route.tsx` が存在するが、各ページの `metadata` に `openGraph.images` が
設定されていない。そのため X（Twitter）・LINE・Slack でリンクをシェアしたとき
画像なしの OGP カードになっており、クリック率を損している。
既存の OG ルートを活用して全主要ページに OGP 画像を設定する。

## スコープ

対象:
- `app/page.tsx`（ホーム）
- `app/c/[competition]/[season]/page.tsx`（シーズンページ）
- `app/c/[competition]/page.tsx`（大会ハブページ）
- `app/matches/[id]/page.tsx`（試合詳細ページ）
- `app/t/[team]/page.tsx`（チームページ）
- `app/pricing/page.tsx`（料金ページ ※ Server Component 化後に実施）

対象外:
- `app/api/og/route.tsx` 自体のロジック変更（現状で機能していれば変更しない）
- OG 画像のビジュアルデザイン改善（別タスク）

## 実装方針

### 手順 1: `app/api/og/route.tsx` のパラメータを確認する

ファイルを読み込み、受け付けるクエリパラメータを特定する。
一般的な構成:

```
/api/og?title=...&description=...
```

matchId 等の特殊パラメータがある場合はそれも確認する。

### 手順 2: 各ページの `metadata` に `openGraph.images` を追加する

#### ホーム（`app/page.tsx`）

```ts
openGraph: {
  images: [{ url: 'https://tryline-six.vercel.app/api/og?title=%E6%B5%B7%E5%A4%96%E3%83%A9%E3%82%B0%E3%83%93%E3%83%BC%E3%82%92%E6%97%A5%E6%9C%AC%E8%AA%9E%E3%81%A7%E6%B7%B1%E6%8E%98%E3%82%8A', width: 1200, height: 630 }],
  // ...既存フィールドは変更しない
},
```

URL エンコードは `encodeURIComponent` を使うか、定数として記述する。

#### シーズンページ（`generateMetadata` 内）

```ts
const ogImageUrl = `https://tryline-six.vercel.app/api/og?title=${encodeURIComponent(title)}`
openGraph: {
  images: [{ url: ogImageUrl, width: 1200, height: 630 }],
}
```

#### 試合詳細ページ（`generateMetadata` 内）

```ts
const ogTitle = `${match.homeTeam.name} vs ${match.awayTeam.name}`
const ogImageUrl = `https://tryline-six.vercel.app/api/og?title=${encodeURIComponent(ogTitle)}`
openGraph: {
  images: [{ url: ogImageUrl, width: 1200, height: 630 }],
}
```

OG ルートが `matchId` をサポートしている場合はスコアを含む画像にできる。
実装を確認して対応できるなら `?matchId={id}` を使う。

#### チームページ・大会ハブ・料金ページ

同じパターンで `title` を渡す。

### ベース URL の扱い

`NEXT_PUBLIC_SITE_URL` 環境変数があればそれを使い、なければ
`https://tryline-six.vercel.app` をハードコードする。
`metadata.metadataBase` が `app/layout.tsx` に設定されていれば相対 URL でよい。
まず `layout.tsx` を確認してから対応方法を決めること。

## 受け入れ条件

- [ ] ホームの `<head>` に `<meta property="og:image">` タグが出力される
- [ ] シーズンページ（例: `/c/six-nations/2025`）に OGP 画像が設定されている
- [ ] 試合詳細ページに OGP 画像が設定されている
- [ ] チームページ・大会ハブ・料金ページに OGP 画像が設定されている
- [ ] `/api/og?title=テスト` を直接ブラウザで開くと画像が返る
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- `app/layout.tsx` に `metadataBase` が設定されているか（相対 URL が使えるか）
- `app/api/og/route.tsx` が受け付けるパラメータの詳細（実装を読んで確認）
