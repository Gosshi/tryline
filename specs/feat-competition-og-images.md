# 大会ページの OG 画像を大会別に生成する

## 背景

2026-07-07〜08 の集客・デザインレビューで、「大会ハブの OG 画像を共通 `/og-image.png` から大会別にする」ことが指摘された。

`app/c/[competition]/page.tsx:71` 実測で、全大会が共通の `${SITE_URL}/og-image.png` を使っており、X・note でシェアされた際にどの大会のリンクか OGP 画像だけでは判別できない。

既存の動的 OG 画像生成基盤（`app/api/og/route.tsx`、`@vercel/og` の `ImageResponse`、edge runtime）は試合結果用（`type=result`）として既に本番稼働しており、`lib/seo/og-image.ts` の `createMatchOgImage` がヘルパとして使われている。本 spec はこの基盤に大会用のバリエーションを追加する。

## スコープ

対象:
- `app/api/og/route.tsx` に `type=competition` の分岐を追加し、大会名・シーズン・アクセントカラーを使った OG 画像を生成する
- `lib/seo/og-image.ts` に `createCompetitionOgImage` ヘルパを追加
- `app/c/[competition]/page.tsx`（ハブページ）と `app/c/[competition]/[season]/page.tsx`（シーズンページ）の `openGraph.images` を、共通画像からこのヘルパ経由の動的画像に差し替える

対象外:
- 試合結果用 OG 画像（`type=result`）のデザイン変更
- ホームページ・料金ページ等、大会に紐付かないページの OG 画像
- OG 画像に試合直近結果やハイライト等の動的スコアデータを載せること（大会名・シーズン・ブランドのみのシンプルなカードに留める。理由: ハブページ/シーズンページの OG は「この大会のページだ」と伝わればよく、試合結果カードとの差別化を明確にする）

## データモデル変更

なし。

## API サーフェス

### `app/api/og/route.tsx` に `type=competition` 分岐を追加

既存の `type=result` 分岐（`searchParams.get("type") === "result"` のブロック）と同じ関数内に、以下を追加する:

```tsx
if (searchParams.get("type") === "competition") {
  const familyName = truncate(searchParams.get("family_name") ?? "Rugby", 30);
  const seasonLabel = truncate(searchParams.get("season") ?? "", 16);
  const accentColor = searchParams.get("accent") ?? "#c93a3a";

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: `linear-gradient(135deg, #151817 0%, ${accentColor} 140%)`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            color: "white",
            fontFamily: fontName,
            fontSize: 72,
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          {familyName}
        </div>
        {seasonLabel && (
          <div
            style={{
              color: "rgba(255,255,255,0.7)",
              fontFamily: fontName,
              fontSize: 36,
              marginTop: 16,
            }}
          >
            {seasonLabel}
          </div>
        )}
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontFamily: fontName,
            fontSize: 24,
            marginTop: 40,
          }}
        >
          Tryline
        </div>
      </div>
    ),
    { fonts: [{ data: fontData, name: fontName }], height: 630, width: 1200 },
  );
}
```

既存の `interFont`/`fontData`/`fontName` 取得ロジック（ファイル冒頭）は共通で使い回す（重複取得しない）。デザインの詳細（グラデーション角度、フォントサイズ等）は Codex の裁量で調整してよいが、「大会名が最も大きく」「シーズンが補助」「Trylineブランドが控えめに入る」という優先順位は維持する。

### `lib/seo/og-image.ts` に `createCompetitionOgImage` を追加

```ts
type CompetitionOgImageParams = {
  accentColor: string;
  familyName: string;
  season?: string;
};

export function createCompetitionOgImage(params: CompetitionOgImageParams) {
  const searchParams = new URLSearchParams({
    accent: params.accentColor,
    family_name: params.familyName,
    type: "competition",
  });

  if (params.season) {
    searchParams.set("season", params.season);
  }

  return {
    height: 630,
    url: `/api/og?${searchParams.toString()}`,
    width: 1200,
  };
}
```

## UI サーフェス

### `app/c/[competition]/page.tsx`（ハブページ）

`generateMetadata`（`page.tsx:60-80` 付近）の `openGraph.images` を、現状の固定 `${SITE_URL}/og-image.png` から `createCompetitionOgImage({ accentColor: getCompetitionFamilyColor(competition), familyName: formatFamilyName(competition) })` に差し替える。

### `app/c/[competition]/[season]/page.tsx`（シーズンページ）

同様に `generateMetadata` の `openGraph.images` を、`createCompetitionOgImage({ accentColor: getCompetitionFamilyColor(family), familyName: formatFamilyName(family), season: comp.season })` に差し替える。

## LLM 連携

なし。

## 受け入れ条件

1. `/c/pnc` の OG 画像 URL（`<meta property="og:image">`）が `/api/og?type=competition&family_name=...` を含む動的画像になっている
2. `/c/pnc/2026` の OG 画像に season パラメータが含まれ、ハブページと異なる URL になっている（シーズンラベルの有無で区別できる）
3. `/api/og?type=competition&family_name=Pacific+Nations+Cup&accent=%23c93a3a` に直接アクセスすると、1200x630 の PNG/JPEG 画像が返る（ステータス200）
4. `type=result` の既存動作（試合結果 OG 画像）に変更がない
5. 大会名が42文字を超える場合、`truncate` により省略される（既存の `truncate` 関数を再利用）
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
7. 主要3〜4大会（PNC・Six Nations・URC・RWC）で実際に生成された OG 画像をスクリーンショットで提示し、大会名が正しく表示されテキストが画像内に収まっていることを確認する

## 未解決の質問

- 大会ロゴ画像（`getCompetitionLogoSrc`、`public/logos/{family}.svg`）を OG カードに埋め込むか、テキストのみのシンプルなカードに留めるか。SVG ロゴを `@vercel/og` の `ImageResponse` に埋め込むには PNG 変換や data URI 化が必要になり複雑さが増すため、本 spec ではテキストのみを採用した。ロゴ埋め込みが必要なら別 spec で拡張
- `type=competition` の OG 画像を X 投稿のデータ画像（`x-post` スキル記載の「大会ラウンド完結時の全結果スコアボード」）と統合・再利用できるかは別トラックとして検討
