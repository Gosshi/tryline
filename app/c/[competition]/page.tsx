import Link from "next/link";
import { notFound } from "next/navigation";

import { listSeasonsByFamily } from "@/lib/db/queries/competitions";

type Props = {
  params: Promise<{ competition: string }>;
};

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
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {latestSeason.name}
        </h1>
        <p className="mt-2 text-sm text-slate-500">全シーズン一覧</p>

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
