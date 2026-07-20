import type {
  TeamRecord,
  TeamScoringStats,
  TopScorer,
} from "@/lib/db/queries/team-stats";
import type { ReactNode } from "react";

type TeamStatsPanelProps = {
  record: TeamRecord;
  scoring: TeamScoringStats;
  topScorers: TopScorer[];
};

const FORM_STYLE: Record<
  "W" | "D" | "L",
  { className: string; label: string }
> = {
  D: { className: "bg-slate-300", label: "引き分け" },
  L: { className: "bg-rose-500", label: "負け" },
  W: { className: "bg-emerald-500", label: "勝ち" },
};

function formatAverage(value: number): string {
  return value.toFixed(1);
}

function StatCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function TeamStatsPanel({
  record,
  scoring,
  topScorers,
}: TeamStatsPanelProps) {
  return (
    <section aria-labelledby="team-stats-heading" className="space-y-4">
      <h2
        className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]"
        id="team-stats-heading"
      >
        チームスタッツ
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard title="勝敗記録">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
                W
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                {record.wins}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
                D
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                {record.draws}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
                L
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                {record.losses}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            直近 {record.matchCount} 試合
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
            <div>
              <p className="text-[var(--color-ink-muted)]">得点合計</p>
              <p className="mt-1 font-semibold tabular-nums text-[var(--color-ink)]">
                {record.pointsFor}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-ink-muted)]">失点合計</p>
              <p className="mt-1 font-semibold tabular-nums text-[var(--color-ink)]">
                {record.pointsAgainst}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
              Form
            </span>
            {record.form.length > 0 ? (
              <div className="flex gap-1.5">
                {record.form.map((result, index) => (
                  <span
                    aria-label={FORM_STYLE[result].label}
                    className={`h-2.5 w-2.5 rounded-full ${FORM_STYLE[result].className}`}
                    key={`${result}-${index}`}
                    title={FORM_STYLE[result].label}
                  />
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-400">試合データなし</span>
            )}
          </div>
        </StatCard>

        <StatCard title="得点スタッツ">
          {scoring.matchCount === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
              イベントデータなし
            </p>
          ) : (
            <dl className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-[var(--color-ink-muted)]">
                  平均得点
                </dt>
                <dd className="text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                  {formatAverage(scoring.pointsForPerMatch)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-[var(--color-ink-muted)]">
                  平均トライ
                </dt>
                <dd className="font-semibold tabular-nums text-[var(--color-ink)]">
                  {formatAverage(scoring.triesPerMatch)} / 試合
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-[var(--color-ink-muted)]">
                  平均ペナルティ
                </dt>
                <dd className="font-semibold tabular-nums text-[var(--color-ink)]">
                  {formatAverage(scoring.penaltyGoalsPerMatch)} / 試合
                </dd>
              </div>
              <p className="border-t border-slate-100 pt-3 text-xs text-[var(--color-ink-muted)]">
                得点イベントを確認できた {scoring.matchCount} 試合から集計
              </p>
            </dl>
          )}
        </StatCard>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 md:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            トップスコアラー
          </h3>
          {topScorers.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
              選手別イベントデータなし
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-slate-100 text-xs font-semibold text-[var(--color-ink-muted)]">
                  <tr>
                    <th className="py-2 pr-3">選手名</th>
                    <th className="px-3 py-2 text-right" title="トライ">
                      T
                    </th>
                    <th className="px-3 py-2 text-right" title="コンバージョン">
                      Con
                    </th>
                    <th className="px-3 py-2 text-right" title="ペナルティ/DG">
                      PG
                    </th>
                    <th className="py-2 pl-3 text-right">計 (pts)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topScorers.map((scorer) => (
                    <tr key={scorer.playerName}>
                      <td className="max-w-[12rem] truncate py-2 pr-3 font-medium text-[var(--color-ink)]">
                        {scorer.playerName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink)]">
                        {scorer.tries}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink)]">
                        {scorer.conversions}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink)]">
                        {scorer.penalties}
                      </td>
                      <td className="py-2 pl-3 text-right font-semibold tabular-nums text-[var(--color-ink)]">
                        {scorer.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
