import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listSeasonsByFamily } from "@/lib/db/queries/competitions";
import { formatFamilyName } from "@/lib/format/competition";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ competition: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition } = await params;
  const name = formatFamilyName(competition);
  const description = `${name} の全シーズン試合結果・順位表・AI日本語レビュー一覧。`;

  return {
    description,
    openGraph: {
      description,
      title: `${name} — 全シーズン一覧 | Tryline`,
      type: "website",
      url: `https://tryline-six.vercel.app/c/${competition}`,
    },
    title: `${name} — 全シーズン一覧`,
  };
}

export default async function CompetitionHubPage({ params }: Props) {
  const { competition } = await params;
  const seasons = await listSeasonsByFamily(competition);

  if (seasons.length === 0) {
    notFound();
  }

  const latestSeason = seasons[0];

  if (!latestSeason) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="relative h-48 w-full overflow-hidden sm:h-56">
        <Image
          alt={formatFamilyName(competition)}
          className="object-cover object-center"
          fill
          priority
          sizes="100vw"
          src="https://images.unsplash.com/photo-1767190937750-d6aaf8ea99d0?w=1200&q=80"
        />
        <div className="absolute inset-0 bg-slate-950/60" />
        <div className="absolute inset-0 flex flex-col justify-end px-4 pb-6 sm:px-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {formatFamilyName(competition)}
            </h1>
            <p className="mt-1 text-sm text-white/70">全シーズン一覧</p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:px-8">
        <ul className="mt-8 space-y-3">
          {seasons.map((season) => (
            <li key={season.slug}>
              <Link
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
                href={`/c/${competition}/${season.season}`}
              >
                <span className="text-lg font-semibold text-slate-900">
                  {season.season}
                </span>
                {season.startDate && season.endDate && (
                  <span className="text-sm text-slate-500">
                    {season.startDate.slice(0, 7)} 〜{" "}
                    {season.endDate.slice(0, 7)}
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
