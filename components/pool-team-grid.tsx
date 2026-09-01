import type { PoolStanding } from "@/lib/db/queries/standings";

type PoolTeamGridProps = {
  ariaLabel: string;
  poolStandings: PoolStanding[];
};

export function PoolTeamGrid({ ariaLabel, poolStandings }: PoolTeamGridProps) {
  if (poolStandings.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={ariaLabel}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {poolStandings.map((pool) => (
        <div
          className="rounded-[var(--radius-md)] bg-white p-4 shadow-[var(--shadow-soft)]"
          key={pool.poolName}
        >
          {pool.poolName && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {pool.poolName}
            </p>
          )}
          <ul className={pool.poolName ? "mt-2 space-y-1" : "space-y-1"}>
            {pool.standings.map((row) => (
              <li
                className="text-sm font-medium text-[var(--color-ink)]"
                key={row.position}
              >
                {row.teamName === "-" ? (
                  <span className="text-slate-400">未確定</span>
                ) : (
                  row.teamName
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
