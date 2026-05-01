import Link from "next/link";

type SeasonSwitcherProps = {
  seasons: { season: string }[];
  currentSeason: string;
  competition: string;
};

export function SeasonSwitcher({
  seasons,
  currentSeason,
  competition,
}: SeasonSwitcherProps) {
  if (seasons.length <= 1) {
    return null;
  }

  return (
    <nav aria-label="シーズン選択">
      <ul className="flex gap-1 overflow-x-auto pb-1">
        {seasons.map(({ season }) => {
          const isCurrent = season === currentSeason;

          return (
            <li className="flex-shrink-0" key={season}>
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="inline-flex items-center rounded-full bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white"
                >
                  {season}
                </span>
              ) : (
                <Link
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  href={`/c/${competition}/${season}`}
                >
                  {season}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
