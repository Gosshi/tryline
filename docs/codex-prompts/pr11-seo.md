# chore: SEO 強化 — メタデータ・OGP・JSON-LD・サイトマップ

## 目的

各ページのメタデータ・OGP・構造化データ（JSON-LD）を整備し、
動的サイトマップと robots.txt を追加する。
機能変更はなし。検索エンジンと SNS シェア向けの情報追加のみ。

**必ず `design.md` を最初に読んでから実装すること。**

本番 URL は `https://tryline-six.vercel.app` とする。

---

## 変更項目

### 1. `app/layout.tsx` — title テンプレートと metadataBase の設定

```tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://tryline-six.vercel.app"),
  title: {
    default: "Tryline",
    template: "%s | Tryline",
  },
  description:
    "Six Nations・Premiership・URC など海外ラグビーの試合結果・順位表・AI日本語レビューを提供するラグビーファン向けサービス。",
  openGraph: {
    siteName: "Tryline",
    locale: "ja_JP",
    type: "website",
  },
};
```

---

### 2. `app/page.tsx` — ホームページのメタデータ充実

```tsx
export const metadata: Metadata = {
  title: "海外ラグビーを日本語で深掘り",
  description:
    "Six Nations・Premiership・URC など海外ラグビーの試合結果・AI日本語レビューを提供。DAZN・J SPORTS 加入者向けの試合コンパニオン。",
  openGraph: {
    title: "Tryline — 海外ラグビーを日本語で深掘り",
    description:
      "Six Nations・Premiership・URC など海外ラグビーの試合結果・AI日本語レビューを提供。",
    url: "https://tryline-six.vercel.app",
    type: "website",
  },
};
```

---

### 3. `app/c/[competition]/page.tsx` — 大会ハブページに generateMetadata を追加

現在このページには `generateMetadata` がない。
`formatFamilyName` は `lib/format/competition` から import する。

```tsx
import { formatFamilyName } from "@/lib/format/competition";
import type { Metadata } from "next";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition } = await params;
  const name = formatFamilyName(competition);

  return {
    title: `${name} — 全シーズン一覧`,
    description: `${name} の全シーズン試合結果・順位表・AI日本語レビュー一覧。`,
    openGraph: {
      title: `${name} — 全シーズン一覧 | Tryline`,
      description: `${name} の全シーズン試合結果・順位表・AI日本語レビュー一覧。`,
      url: `https://tryline-six.vercel.app/c/${competition}`,
      type: "website",
    },
  };
}
```

---

### 4. `app/c/[competition]/[season]/page.tsx` — description と OGP を追加

既存の `generateMetadata` を拡張する。

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    return { title: "Tryline" };
  }

  const title = formatCompetitionTitle(comp.name, comp.season);
  const description = `${title} の試合結果・順位表・AI日本語レビュー一覧。`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Tryline`,
      description,
      url: `https://tryline-six.vercel.app/c/${competition}/${season}`,
      type: "website",
    },
  };
}
```

---

### 5. `app/matches/[id]/page.tsx` — OGP と JSON-LD (SportsEvent) を追加

**OGP の追加** — 既存の `generateMetadata` に openGraph を追加する。
`formatCompetitionTitle` は `lib/format/competition` から import する。

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [match, content] = await Promise.all([
    getMatchById(id),
    getPublishedContentForMatch(id),
  ]);

  if (!match) {
    return { title: "Match Not Found" };
  }

  const title = `${match.homeTeam.name} vs ${match.awayTeam.name} — ${formatCompetitionTitle(match.competition.name, match.competition.season)}`;
  const description = content.preview
    ? extractDescription(content.preview.contentMdJa)
    : `${match.homeTeam.name} vs ${match.awayTeam.name} の試合結果・AI日本語レビュー。`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Tryline`,
      description,
      url: `https://tryline-six.vercel.app/matches/${id}`,
      type: "article",
    },
  };
}
```

**JSON-LD の追加** — `MatchDetailPage` コンポーネント内で `jsonLd` オブジェクトを組み立て、
`return` の JSX を Fragment で包んで `<script>` タグを追加する:

```tsx
export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  // ... 既存のデータ取得 ...

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
    startDate: match.kickoffAt,
    sport: "Rugby Union",
    homeTeam: {
      "@type": "SportsTeam",
      name: match.homeTeam.name,
    },
    awayTeam: {
      "@type": "SportsTeam",
      name: match.awayTeam.name,
    },
    ...(match.venue ? { location: { "@type": "Place", name: match.venue } } : {}),
    ...(match.status === "finished"
      ? {
          eventStatus: "https://schema.org/EventScheduled",
          homeTeam: {
            "@type": "SportsTeam",
            name: match.homeTeam.name,
            score: match.homeScore ?? 0,
          },
          awayTeam: {
            "@type": "SportsTeam",
            name: match.awayTeam.name,
            score: match.awayScore ?? 0,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <main className="min-h-screen bg-slate-50">
        {/* ... 既存の JSX ... */}
      </main>
    </>
  );
}
```

---

### 6. `lib/db/queries/matches.ts` — `listAllMatchIds` 関数を追加

サイトマップ生成用。全試合の ID を新しい順に返す。

```ts
export async function listAllMatchIds(): Promise<string[]> {
  const client = getSupabasePublicServerClient();

  const { data, error } = await client
    .from("matches")
    .select("id")
    .order("kickoff_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data.map((row) => row.id);
}
```

---

### 7. `app/sitemap.ts` — 動的サイトマップを新規作成

```ts
import {
  listFamilies,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { listAllMatchIds } from "@/lib/db/queries/matches";

import type { MetadataRoute } from "next";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://tryline-six.vercel.app";

  const [families, matchIds] = await Promise.all([
    listFamilies(),
    listAllMatchIds(),
  ]);

  const seasonPages = (
    await Promise.all(
      families.map(async (family) => {
        const seasons = await listSeasonsByFamily(family);
        return seasons.map((s) => ({
          url: `${base}/c/${family}/${s.season}`,
          lastModified: new Date(),
          changeFrequency: "daily" as const,
          priority: 0.8,
        }));
      }),
    )
  ).flat();

  const familyPages = families.map((family) => ({
    url: `${base}/c/${family}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const matchPages = matchIds.map((id) => ({
    url: `${base}/matches/${id}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...familyPages,
    ...seasonPages,
    ...matchPages,
  ];
}
```

---

### 8. `app/robots.ts` — robots.txt を新規作成

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://tryline-six.vercel.app/sitemap.xml",
  };
}
```

---

## 変更・作成するファイル

- `app/layout.tsx`
- `app/page.tsx`
- `app/c/[competition]/page.tsx`
- `app/c/[competition]/[season]/page.tsx`
- `app/matches/[id]/page.tsx`
- `lib/db/queries/matches.ts`（`listAllMatchIds` を追加）
- `app/sitemap.ts`（新規作成）
- `app/robots.ts`（新規作成）

## 変更しないこと

- `app/globals.css`
- `tailwind.config.ts`
- `design.md`
- コンポーネントのレンダリングロジック
- データ取得クエリの既存ロジック

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `/sitemap.xml` にアクセスして全ページ URL が含まれること
- `/robots.txt` が `Sitemap:` 行を含むこと
- 試合詳細ページのソースに `application/ld+json` の SportsEvent スキーマが含まれること
- OGP タグ（`og:title`・`og:description`・`og:type`）がすべてのページに存在すること

## ブランチ・PR

- ブランチ: `chore/seo`
- PR タイトル: `Chore: add metadata, OGP, JSON-LD schema, sitemap, and robots.txt`
