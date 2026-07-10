import { cn } from "@/lib/utils";

import type { StandingRow } from "@/lib/db/queries/standings";

type StandingTableEntry =
  | { row: StandingRow; type: "row" }
  | { key: string; type: "gap" };

function buildTableEntries(
  rows: StandingRow[],
  showGaps: boolean,
): StandingTableEntry[] {
  if (!showGaps) {
    return rows.map((row) => ({ row, type: "row" as const }));
  }

  return rows.flatMap((row, index) => {
    const previous = rows[index - 1];
    const entries: StandingTableEntry[] = [];

    if (previous && row.position - previous.position > 1) {
      entries.push({
        key: `gap-${previous.position}-${row.position}`,
        type: "gap",
      });
    }

    entries.push({ row, type: "row" });

    return entries;
  });
}

export function StandingsTable({
  highlightedTeams = [],
  excerptThreshold = 10,
  standings,
  title = "順位表",
}: {
  excerptThreshold?: number;
  highlightedTeams?: string[];
  standings: StandingRow[];
  title?: string;
}) {
  if (standings.length === 0) {
    return null;
  }

  const highlighted = new Set(
    highlightedTeams.map((team) => team.trim().toLowerCase()),
  );
  const excerptRows = standings.filter(
    (row) =>
      highlighted.has(row.teamName.toLowerCase()) ||
      highlighted.has(row.teamShortCode.toLowerCase()),
  );
  const shouldUseExcerpt =
    standings.length >= excerptThreshold && excerptRows.length > 0;

  function renderTable(rows: StandingRow[], showGaps = false) {
    const entries = buildTableEntries(rows, showGaps);

    return (
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
            {entries.map((entry) => {
              if (entry.type === "gap") {
                return (
                  <tr
                    aria-label="省略された順位があります"
                    className="border-b border-slate-50 text-center text-slate-400"
                    key={entry.key}
                  >
                    <td className="py-1" colSpan={9}>
                      …
                    </td>
                  </tr>
                );
              }

              const { row } = entry;
              const isHighlighted =
                highlighted.has(row.teamName.toLowerCase()) ||
                highlighted.has(row.teamShortCode.toLowerCase());

              return (
                <tr
                  className={cn(
                    "border-b border-slate-50 last:border-0",
                    isHighlighted
                      ? "bg-[var(--color-accent-subtle)] font-bold [&>td:first-child]:text-[var(--color-accent)] [&>td:last-child]:text-[var(--color-accent)]"
                      : row.position === 1
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
                    <span className="hidden sm:inline">{row.teamName}</span>
                    <span className="sm:hidden" title={row.teamName}>
                      {row.teamShortCode}
                    </span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Standings
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          {title}
        </h2>
      </div>

      {shouldUseExcerpt ? (
        <div className="space-y-4">
          {renderTable(excerptRows, true)}
          <details>
            <summary className="cursor-pointer rounded-full border border-slate-200 px-4 py-2 text-center text-xs font-bold text-[var(--color-accent)] transition-colors hover:border-slate-300 hover:bg-slate-50">
              全順位表を見る
            </summary>
            <div className="mt-4 border-t border-slate-100 pt-4">
              {renderTable(standings)}
            </div>
          </details>
        </div>
      ) : (
        renderTable(standings)
      )}
    </section>
  );
}
