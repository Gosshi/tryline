# feat: 試合ページの動的 OGP 画像（@vercel/og）

## 目的

試合詳細ページが SNS でシェアされたとき、
試合情報（チーム名・スコア・大会名）を含む
OGP 画像を動的生成する。
`@vercel/og`（satori / ImageResponse）を使い、Vercel Edge Function で配信する。

**必ず `design.md` を最初に読んでから実装すること。**

## 参照すべきファイル

- `app/matches/[id]/page.tsx` — 既存の `generateMetadata` に `images` を追加
- `lib/db/queries/matches.ts` — `getMatchById` を再利用
- `lib/format/competition.ts` — `formatCompetitionTitle`
- `design.md` — カラートークン参照

## 実装

### 1. `@vercel/og` をインストール

```bash
pnpm add @vercel/og
```

---

### 2. `app/api/og/route.tsx` を新規作成

クエリパラメータ:
- `home` — ホームチーム名
- `away` — アウェイチーム名
- `score` — スコア文字列（`"24 - 18"` | `""`）
- `competition` — 大会名（`formatCompetitionTitle` 適用済み文字列）
- `status` — `"finished"` | `"upcoming"` | `"live"`

```tsx
import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const home = searchParams.get("home") ?? "Home";
  const away = searchParams.get("away") ?? "Away";
  const score = searchParams.get("score") ?? "";
  const competition = searchParams.get("competition") ?? "Rugby";
  const status = searchParams.get("status") ?? "upcoming";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "1200px",
          height: "630px",
          background: "#0f172a",
          padding: "64px",
          fontFamily: "sans-serif",
          color: "white",
          justifyContent: "space-between",
        }}
      >
        {/* ヘッダー: ロゴ + 大会名 */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#22c55e",
            }}
          />
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#94a3b8" }}>
            Tryline
          </span>
          <span style={{ color: "#475569", fontSize: "18px" }}>—</span>
          <span style={{ fontSize: "18px", color: "#94a3b8" }}>{competition}</span>
        </div>

        {/* 試合情報 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "32px",
              fontSize: "56px",
              fontWeight: 900,
            }}
          >
            <span>{home}</span>
            {score ? (
              <span
                style={{
                  fontSize: "48px",
                  fontWeight: 700,
                  color: "#22c55e",
                  minWidth: "160px",
                  textAlign: "center",
                }}
              >
                {score}
              </span>
            ) : (
              <span style={{ fontSize: "36px", color: "#475569" }}>vs</span>
            )}
            <span>{away}</span>
          </div>

          {status === "live" && (
            <div
              style={{
                background: "#dc2626",
                color: "white",
                padding: "6px 16px",
                borderRadius: "9999px",
                fontSize: "16px",
                fontWeight: 700,
              }}
            >
              LIVE
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{ fontSize: "16px", color: "#475569" }}>
          tryline-six.vercel.app
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
```

---

### 3. `app/matches/[id]/page.tsx` の `generateMetadata` を更新

既存の `openGraph` ブロックに `images` を追加する。
`extractDescription`・`formatCompetitionTitle` は既に import 済みなので追加不要。

```tsx
export async function generateMetadata({ params }: MatchDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const [match, content] = await Promise.all([
    getMatchById(id),
    getPublishedContentForMatch(id),
  ]);

  if (!match) return { title: "Match Not Found" };

  const title = `${match.homeTeam.name} vs ${match.awayTeam.name} — ${formatCompetitionTitle(match.competition.name, match.competition.season)}`;
  const description = content.preview
    ? extractDescription(content.preview.contentMdJa)
    : `${match.homeTeam.name} vs ${match.awayTeam.name} の試合結果・AI日本語レビュー。`;

  const score =
    match.status === "finished" &&
    match.homeScore !== null &&
    match.awayScore !== null
      ? `${match.homeScore} - ${match.awayScore}`
      : "";

  const ogImageUrl = new URL("/api/og", "https://tryline-six.vercel.app");
  ogImageUrl.searchParams.set("home", match.homeTeam.name);
  ogImageUrl.searchParams.set("away", match.awayTeam.name);
  ogImageUrl.searchParams.set("score", score);
  ogImageUrl.searchParams.set(
    "competition",
    formatCompetitionTitle(match.competition.name, match.competition.season),
  );
  ogImageUrl.searchParams.set("status", match.status);

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Tryline`,
      description,
      url: `https://tryline-six.vercel.app/matches/${id}`,
      type: "article",
      images: [
        {
          url: ogImageUrl.toString(),
          width: 1200,
          height: 630,
          alt: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
        },
      ],
    },
  };
}
```

---

## 変更・作成するファイル

- `app/api/og/route.tsx`（新規作成）
- `app/matches/[id]/page.tsx`（`generateMetadata` の `openGraph.images` を追加）

## 変更しないこと

- `app/matches/[id]/page.tsx` の既存ページコンポーネント（`MatchDetailPage`）
- `lib/db/queries/matches.ts`
- `app/layout.tsx`

## 完了条件

- `pnpm add @vercel/og` が成功すること
- `/api/og?home=Scotland&away=England&score=23+-+20&competition=Six+Nations+2025&status=finished` が 1200×630 の画像を返すこと
- `/matches/[id]` のソースに `og:image` タグが含まれること
- `pnpm tsc --noEmit` パス
- `pnpm build` 成功

## ブランチ・PR

- ブランチ: `feat/ogp-dynamic-images`
- PR タイトル: `Feat: add dynamic OGP images for match pages using @vercel/og`
