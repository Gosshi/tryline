import type { MatchEventRow } from "@/lib/db/queries/match-events";

const EVENT_TYPE_LABEL: Record<string, string> = {
  conversion: "コンバージョン",
  drop_goal: "ドロップゴール",
  penalty_goal: "ペナルティゴール",
  red_card: "レッドカード",
  try: "トライ",
  yellow_card: "イエローカード",
};

const EVENT_TYPE_ORDER = [
  "try",
  "conversion",
  "penalty_goal",
  "drop_goal",
  "yellow_card",
  "red_card",
];

type MatchEventsSectionProps = {
  events: MatchEventRow[];
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};

export function MatchEventsSection({
  events,
  homeTeamId,
  homeTeamName,
  awayTeamName,
}: MatchEventsSectionProps) {
  if (events.length === 0) {
    return null;
  }

  const homeEvents = events.filter((event) => event.teamId === homeTeamId);
  const awayEvents = events.filter((event) => event.teamId !== homeTeamId);
  const activeTypes = EVENT_TYPE_ORDER.filter((type) =>
    events.some((event) => event.type === type),
  );

  if (activeTypes.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Scoring Timeline
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
            得点経過
          </h2>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-700">
          {homeTeamName}
        </p>
        <p className="min-w-0 truncate text-sm font-semibold text-slate-700">
          {awayTeamName}
        </p>
      </div>

      <div className="space-y-4">
        {activeTypes.map((type) => (
          <EventTypeGroup
            awayEvents={awayEvents.filter((event) => event.type === type)}
            homeEvents={homeEvents.filter((event) => event.type === type)}
            key={type}
            label={EVENT_TYPE_LABEL[type] ?? type}
          />
        ))}
      </div>
    </section>
  );
}

function EventTypeGroup({
  awayEvents,
  homeEvents,
  label,
}: {
  awayEvents: MatchEventRow[];
  homeEvents: MatchEventRow[];
  label: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50/70 p-3 sm:p-4">
      <EventList events={homeEvents} label={label} />
      <EventList events={awayEvents} label={label} />
    </div>
  );
}

function EventList({
  events,
  label,
}: {
  events: MatchEventRow[];
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold text-slate-400">{label}</p>
      {events.length === 0 ? (
        <p className="text-sm text-slate-300">—</p>
      ) : (
        <div className="space-y-1">
          {events.map((event) => (
            <p
              className="flex min-w-0 items-baseline gap-2 text-sm text-slate-700"
              key={event.id}
            >
              <span className="min-w-0 truncate">
                {event.isPenaltyTry ? "ペナルティトライ" : event.playerName}
              </span>
              {event.minute !== null && (
                <span className="shrink-0 text-xs font-medium text-slate-400">
                  {event.minute}&apos;
                </span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
