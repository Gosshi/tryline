import { cn } from "@/lib/utils";

import type { StandingRow } from "@/lib/db/queries/standings";

export function StandingsTable({ standings }: { standings: StandingRow[] }) {
  if (standings.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Standings
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          順位表
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
              <th className="pb-2 text-left">#</th>
              <th className="pb-2 text-left">チーム</th>
              <th className="pb-2 text-right">試</th>
              <th className="pb-2 text-right">勝</th>
              <th className="hidden pb-2 text-right sm:table-cell">分</th>
              <th className="pb-2 text-right">敗</th>
              <th className="hidden pb-2 text-right sm:table-cell">得点</th>
              <th className="hidden pb-2 text-right sm:table-cell">T</th>
              <th className="pb-2 text-right font-bold text-slate-600">勝点</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr
                className={cn(
                  "border-b border-slate-50 last:border-0",
                  row.position === 1
                    ? "bg-emerald-50/60"
                    : row.position <= 3
                      ? "bg-slate-50/60"
                      : "",
                )}
                key={row.position}
              >
                <td className="py-2 pr-3 tabular-nums text-slate-400">
                  {row.position}
                </td>
                <td className="py-2 pr-4 font-semibold text-slate-900">
                  <span title={row.teamName}>{row.teamShortCode}</span>
                </td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {row.played}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {row.won}
                </td>
                <td className="hidden py-2 text-right tabular-nums text-slate-600 sm:table-cell">
                  {row.drawn}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {row.lost}
                </td>
                <td className="hidden py-2 text-right tabular-nums text-slate-600 sm:table-cell">
                  {row.pointsFor}-{row.pointsAgainst}
                </td>
                <td className="hidden py-2 text-right tabular-nums text-slate-600 sm:table-cell">
                  {row.triesFor}
                </td>
                <td className="py-2 text-right font-display font-bold tabular-nums text-[var(--color-ink)]">
                  {row.totalPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
