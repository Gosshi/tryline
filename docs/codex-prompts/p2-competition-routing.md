# Codex Prompt: コンペティションルーティング新設

## 前提

`p2-add-competition-family.md` が完了していること（`competitions.family` カラム・`lib/db/queries/competitions.ts` が存在する）。

## 背景

現在 `app/page.tsx` は最新 1 大会のみ表示する。2020〜2025 年の Six Nations データが DB にあるが UI からアクセス不可。以下の URL 構造を新設し、過去シーズンに到達できるようにする。

```
/                          → キュレーション型トップ（大会一覧）
/c/[competition]           → 大会ハブ（全シーズン一覧）
/c/[competition]/[season]  → シーズンページ（現在の / の内容）
/matches/[id]              → 変更なし
```

`slug` のマッピング: `params.competition + "-" + params.season` → `six-nations-2025`

---

## Task 1 — `app/c/[competition]/[season]/page.tsx` を新規作成

現在の `app/page.tsx` のロジックをそのまま移植し、ハードコードされた competition slug をルートパラメータに置き換える。

```typescript
// app/c/[competition]/[season]/page.tsx
import { notFound } from "next/navigation";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
// 既存の import（MatchCard, RoundHeading, StandingsTable 等）は app/page.tsx からコピー

type Props = {
  params: Promise<{ competition: string; season: string }>;
};

export const revalidate = 60;

export async function generateMetadata({ params }: Props) {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);
  if (!comp) return { title: "Tryline" };
  return {
    title: `${formatCompetitionTitle(comp.name, comp.season)} - Tryline`,
  };
}

export default async function SeasonPage({ params }: Props) {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);
  if (!comp) notFound();

  // 以降は現在の app/page.tsx の HomePage と同一ロジック
  // listMatchesForCompetition(comp.slug), getStandingsForCompetition(comp.slug) を使う
}
```

レイアウトは現在の `app/page.tsx` と完全に同じで構わない。

---

## Task 2 — `app/c/[competition]/page.tsx` を新規作成（大会ハブ）

そのファミリーの全シーズンを降順で表示するページ。

```typescript
// app/c/[competition]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { listSeasonsByFamily } from "@/lib/db/queries/competitions";

type Props = {
  params: Promise<{ competition: string }>;
};

export default async function CompetitionHubPage({ params }: Props) {
  const { competition } = await params;
  const seasons = await listSeasonsByFamily(competition);
  if (seasons.length === 0) notFound();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {seasons[0].name}
        </h1>
        <p className="mt-2 text-sm text-slate-500">全シーズン一覧</p>

        <ul className="mt-8 space-y-3">
          {seasons.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/c/${competition}/${s.season}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                <span className="text-lg font-semibold text-slate-900">
                  {s.season}
                </span>
                {s.startDate && s.endDate && (
                  <span className="text-sm text-slate-500">
                    {s.startDate.slice(0, 7)} 〜 {s.endDate.slice(0, 7)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
```

---

## Task 3 — `app/page.tsx` をキュレーション型トップに変更

現在の「最新 1 大会の試合一覧」を「大会一覧」に置き換える。

```typescript
import Link from "next/link";
import { listFamilies, getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { getLatestCompetitionWithMatches } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";

export const revalidate = 60;

export default async function HomePage() {
  const [families, latest] = await Promise.all([
    listFamilies(),
    getLatestCompetitionWithMatches(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 md:px-8 space-y-10">

        {/* Hero（既存のまま残す） */}
        <section className="border-b border-slate-200 bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-600">
              AI Rugby Analysis in Japanese
            </p>
            <h1 className="text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
              海外ラグビーを、日本語で深掘り。
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-600">
              Six Nations をはじめとする世界のラグビーリーグを、AI が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
            </p>
          </div>
        </section>

        {/* 最新シーズンへのショートカット */}
        {latest && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600">
              最新シーズン
            </h2>
            <Link
              href={`/c/${latest.family}/${latest.season}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <span className="text-lg font-semibold text-slate-900">
                {formatCompetitionTitle(latest.name, latest.season)}
              </span>
              <span className="text-sm text-slate-500">試合一覧 →</span>
            </Link>
          </section>
        )}

        {/* 大会アーカイブ */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600">
            大会アーカイブ
          </h2>
          <ul className="space-y-2">
            {families.map((family) => (
              <li key={family}>
                <Link
                  href={`/c/${family}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
                >
                  <span className="font-semibold capitalize text-slate-900">
                    {family.replace(/-/g, " ")}
                  </span>
                  <span className="text-sm text-slate-500">全シーズン →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

      </div>
    </main>
  );
}
```

`latest.family` は `getLatestCompetitionWithMatches()` の返り値に `family` フィールドが含まれていない場合、`getCompetitionBySlug(latest.slug)` で補完するか、クエリ側に `family` を追加すること。実装時に判断してよい。

---

## Task 4 — 旧 URL のリダイレクト

`app/competitions/[slug]/page.tsx` を新規作成して旧 URL から新 URL へリダイレクトする。

```typescript
// app/competitions/[slug]/page.tsx
import { redirect } from "next/navigation";

export default async function LegacyRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const match = slug.match(/^(.+)-(\d{4})$/);
  if (!match) redirect("/");
  redirect(`/c/${match[1]}/${match[2]}`);
}
```

---

## 完了条件

- [ ] `/c/six-nations/2025` で Six Nations 2025 の試合一覧が表示される
- [ ] `/c/six-nations/2020` で Six Nations 2020 の試合一覧が表示される
- [ ] `/c/six-nations` で 2020〜2025 のシーズン一覧が表示される
- [ ] `/c/six-nations/9999` で 404 になる
- [ ] `/` でヒーロー + 最新シーズンリンク + 大会アーカイブが表示される
- [ ] `/competitions/six-nations-2025` が `/c/six-nations/2025` にリダイレクトされる
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `app/matches/[id]/page.tsx`
- `components/` 以下の既存コンポーネント
- `lib/db/queries/matches.ts`
