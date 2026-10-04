import { getTeamStripe } from "@/lib/format/team-identity";

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
            <tr className="border-b border-[var(--color-rule)] text-xs font-semibold text-[var(--color-ink-muted)]">
              <th className="pb-2 text-left">#</th>
              <th className="pb-2 text-left">チーム</th>
              <th className="pb-2 text-right">試</th>
              <th className="pb-2 text-right">勝</th>
              <th className="hidden pb-2 text-right sm:table-cell">分</th>
              <th className="pb-2 text-right">敗</th>
              <th className="hidden pb-2 text-right sm:table-cell">得点</th>
              <th className="hidden pb-2 text-right sm:table-cell">T</th>
              <th className="pb-2 text-right font-bold text-[var(--color-ink-muted)]">
                勝点
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              if (entry.type === "gap") {
                return (
                  <tr
                    aria-label="省略された順位があります"
                    className="border-b border-[var(--color-rule)] text-center text-[var(--color-ink-muted)]"
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
                  className={`border-b border-[var(--color-rule)] last:border-0 ${
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
                  <td className="py-2 pr-3 tabular-nums text-[var(--color-ink-muted)]">
                    {row.position}
                  </td>
                  <td className="py-2 pr-4 font-semibold text-[var(--color-ink)]">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-[0.85em] w-1 shrink-0 rounded-[1px] border border-black/15"
                        style={{
                          background: getTeamStripe(row.teamSlug ?? ""),
                        }}
                      />
                      <span className="hidden sm:inline">{row.teamName}</span>
                      <span className="sm:hidden" title={row.teamName}>
                        {row.teamShortCode}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--color-ink-muted)]">
                    {row.played}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--color-ink-muted)]">
                    {row.won}
                  </td>
                  <td className="hidden py-2 text-right tabular-nums text-[var(--color-ink-muted)] sm:table-cell">
                    {row.drawn}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--color-ink-muted)]">
                    {row.lost}
                  </td>
                  <td className="hidden py-2 text-right tabular-nums text-[var(--color-ink-muted)] sm:table-cell">
                    {row.pointsFor}-{row.pointsAgainst}
                  </td>
                  <td className="hidden py-2 text-right tabular-nums text-[var(--color-ink-muted)] sm:table-cell">
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
    <section className="overflow-hidden rounded-sm border border-[var(--color-rule)] bg-card">
      <div className="flex items-center border-b border-[var(--color-rule)] px-5 py-3 sm:px-6">
        <h2 className="font-heading text-sm font-extrabold tracking-wide text-[var(--color-brass)]">
          {title}
        </h2>
      </div>
      <div className="p-5 sm:p-6">
        {shouldUseExcerpt ? (
          <div className="space-y-4">
            {renderTable(excerptRows, true)}
            <details>
              <summary className="min-h-11 cursor-pointer rounded-full border border-[var(--color-rule)] px-4 py-2 text-center text-xs font-bold text-[var(--color-accent)] transition-colors hover:border-[var(--color-ink-muted)] hover:bg-[var(--color-panel)]">
                全順位表を見る
              </summary>
              <div className="mt-4 border-t border-[var(--color-rule)] pt-4">
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
