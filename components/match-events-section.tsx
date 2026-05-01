import { getTeamColor } from "@/lib/format/team-identity";

import type { MatchEventRow } from "@/lib/db/queries/match-events";

const EVENT_TYPE_LABEL: Record<string, string> = {
  conversion: "コンバージョン",
  drop_goal: "ドロップゴール",
  penalty_goal: "ペナルティゴール",
  red_card: "レッドカード",
  try: "トライ",
  yellow_card: "イエローカード",
};

type MatchEventsSectionProps = {
  events: MatchEventRow[];
  homeTeamId: string;
  homeTeamName: string;
  homeTeamSlug: string;
  awayTeamName: string;
  awayTeamSlug: string;
};

function sortEvents(events: MatchEventRow[]): MatchEventRow[] {
  return [...events].sort((a, b) => {
    if (a.minute === null && b.minute === null) {
      return 0;
    }

    if (a.minute === null) {
      return 1;
    }

    if (b.minute === null) {
      return -1;
    }

    return a.minute - b.minute;
  });
}

export function MatchEventsSection({
  events,
  homeTeamId,
  homeTeamName,
  homeTeamSlug,
  awayTeamName,
  awayTeamSlug,
}: MatchEventsSectionProps) {
  if (events.length === 0) {
    return null;
  }

  const homeColor = getTeamColor(homeTeamSlug);
  const awayColor = getTeamColor(awayTeamSlug);
  const sorted = sortEvents(events);
  const homeEvents = sorted.filter((event) => event.teamId === homeTeamId);
  const awayEvents = sorted.filter((event) => event.teamId !== homeTeamId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Scoring Timeline
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          得点経過
        </h2>
      </div>

      <div className="mb-2 grid grid-cols-[1fr_2.5rem_1fr] gap-2 text-xs font-semibold text-slate-500">
        <span className="min-w-0 truncate">{homeTeamName}</span>
        <span />
        <span className="min-w-0 truncate text-right">{awayTeamName}</span>
      </div>

      <div className="space-y-0.5">
        {sorted.map((event) => {
          const isHome = event.teamId === homeTeamId;
          const label = event.isPenaltyTry
            ? "ペナルティトライ"
            : `${event.playerName} ${EVENT_TYPE_LABEL[event.type] ?? event.type}`;
          const teamColor = isHome ? homeColor : awayColor;

          return (
            <div
              className="grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 rounded py-1.5 hover:bg-slate-50/80"
              key={event.id}
              style={
                isHome
                  ? { borderLeft: `3px solid ${teamColor}`, paddingLeft: "8px" }
                  : {
                      borderRight: `3px solid ${teamColor}`,
                      paddingRight: "8px",
                    }
              }
            >
              <span
                className="min-w-0 truncate text-xs text-[var(--color-ink)] sm:text-sm"
                title={isHome ? label : ""}
              >
                {isHome ? label : ""}
              </span>
              <span className="text-center text-xs font-semibold tabular-nums text-[var(--color-ink-muted)]">
                {event.minute !== null ? `${event.minute}'` : "—"}
              </span>
              <span
                className="min-w-0 truncate text-right text-xs text-[var(--color-ink)] sm:text-sm"
                title={!isHome ? label : ""}
              >
                {!isHome ? label : ""}
              </span>
            </div>
          );
        })}
      </div>
      {(homeEvents.length === 0 || awayEvents.length === 0) && (
        <p className="mt-3 text-center text-xs text-slate-400">
          {homeEvents.length === 0
            ? `${homeTeamName}: 得点なし`
            : `${awayTeamName}: 得点なし`}
        </p>
      )}
    </section>
  );
}
