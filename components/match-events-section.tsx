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
  awayTeamName: string;
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
  awayTeamName,
}: MatchEventsSectionProps) {
  if (events.length === 0) {
    return null;
  }

  const sorted = sortEvents(events);

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

      <div className="mb-2 grid grid-cols-[1fr_3rem_1fr] gap-2 text-xs font-semibold text-slate-500">
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

          return (
            <div
              className="grid grid-cols-[1fr_3rem_1fr] items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
              key={event.id}
            >
              <span className="min-w-0 truncate text-sm text-slate-700">
                {isHome ? label : ""}
              </span>
              <span className="text-center text-xs font-semibold tabular-nums text-slate-400">
                {event.minute !== null ? `${event.minute}'` : "—"}
              </span>
              <span className="min-w-0 truncate text-right text-sm text-slate-700">
                {!isHome ? label : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
