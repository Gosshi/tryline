import type { StandingRow } from "@/lib/db/queries/standings";

function withOpacity(color: string, opacity: number): string {
  const hex = color.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return `rgb(15 23 42 / ${opacity})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `rgb(${red} ${green} ${blue} / ${opacity})`;
}

function darken(color: string): string {
  const hex = color.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return "#0f172a";
  }

  const channels = [0, 2, 4].map((offset) =>
    Math.round(Number.parseInt(hex.slice(offset, offset + 2), 16) * 0.55),
  );

  return `rgb(${channels.join(" ")})`;
}

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
  accentColor = "#1e293b",
  highlightedTeams = [],
  excerptThreshold = 10,
  standings,
  title = "順位表",
}: {
  accentColor?: string;
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
        <table className="w-full min-w-[34rem] text-sm">
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
              const positionTint =
                row.position <= 2
                  ? 0.16
                  : row.position === 3
                    ? 0.09
                    : row.position === 4
                      ? 0.045
                      : 0;

              return (
                <tr
                  className={`border-b border-slate-50 last:border-0 ${
                    isHighlighted
                      ? "bg-[var(--color-accent-subtle)] font-bold [&>td:first-child]:text-[var(--color-accent)] [&>td:last-child]:text-[var(--color-accent)]"
                      : ""
                  }`}
                  key={row.position}
                  style={{
                    backgroundColor: isHighlighted
                      ? "var(--color-accent-subtle)"
                      : positionTint > 0
                        ? withOpacity(accentColor, positionTint)
                        : undefined,
                  }}
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
    <section className="overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[var(--shadow-soft)]">
      <div
        className="flex items-center px-5 py-3 text-white sm:px-6"
        style={{ backgroundColor: darken(accentColor) }}
      >
        <h2 className="text-sm font-bold tracking-wide text-white">{title}</h2>
      </div>
      <div className="p-5 sm:p-6">
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
      </div>
    </section>
  );
}
