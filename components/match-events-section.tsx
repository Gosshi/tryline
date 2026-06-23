import { ScoreGraph } from "@/components/score-graph";
import { deriveMatchEventHighlights } from "@/lib/format/match-key-moment";
import { buildScoreTimeline } from "@/lib/format/match-timeline";
import { getTeamColor } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

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
  awayTeamName: string;
  awayTeamSlug: string;
  events: MatchEventRow[];
  finalAwayScore: number;
  finalHomeScore: number;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamSlug: string;
  variant?: "highlights" | "timeline";
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
  awayTeamName,
  awayTeamSlug,
  events,
  finalAwayScore,
  finalHomeScore,
  homeTeamId,
  homeTeamName,
  homeTeamSlug,
  variant = "highlights",
}: MatchEventsSectionProps) {
  if (events.length === 0) {
    return null;
  }

  const homeColor = getTeamColor(homeTeamSlug);
  const awayColor = getTeamColor(awayTeamSlug);
  const sorted = sortEvents(events);
  const timeline = buildScoreTimeline(sorted, homeTeamId);
  const highlights = deriveMatchEventHighlights({
    events: sorted,
    finalAwayScore,
    finalHomeScore,
    homeTeamId,
  });
  const homeEvents = sorted.filter((event) => event.teamId === homeTeamId);
  const awayEvents = sorted.filter((event) => event.teamId !== homeTeamId);
  const teamName = (team: "home" | "away") =>
    team === "home" ? homeTeamName : awayTeamName;

  if (variant === "highlights") {
    const chips = [
      highlights.firstHalfMaxLead
        ? {
            key: "first-half",
            label: "前半の最大リード",
            value: `${teamName(highlights.firstHalfMaxLead.team)} ${highlights.firstHalfMaxLead.margin}点差`,
          }
        : null,
      highlights.firstYellowCard
        ? {
            key: "yellow-card",
            label: `${teamName(highlights.firstYellowCard.team)}${
              highlights.firstYellowCard.event.minute === null
                ? ""
                : `・${highlights.firstYellowCard.event.minute}分`
            }`,
            value: "イエローカード",
          }
        : null,
    ].filter((chip): chip is NonNullable<typeof chip> => chip !== null);
    const primary = highlights.primary;
    const primaryLabel = primary
      ? primary.event.isPenaltyTry
        ? "ペナルティトライ"
        : (EVENT_TYPE_LABEL[primary.event.type] ?? primary.event.type)
      : null;

    if (!primary && chips.length === 0) {
      return null;
    }

    return (
      <section aria-labelledby="match-highlights-heading">
        <h2
          className="mb-4 ml-1 flex items-center gap-2.5 text-sm font-bold text-[var(--color-ink-muted)] before:h-5 before:w-1.5 before:rounded-full before:bg-[var(--color-accent)]"
          id="match-highlights-heading"
        >
          この試合の要点
        </h2>
        {primary && primaryLabel && (
          <div className="flex items-center gap-4 rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] bg-[var(--color-accent-subtle)] text-center font-number font-bold leading-none text-[var(--color-accent)]">
              {primary.event.minute === null ? (
                <span className="text-sm">得点</span>
              ) : (
                <span className="text-2xl">
                  {primary.event.minute}
                  <small className="mt-1 block font-body text-[10px]">分</small>
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--color-ink-muted)]">
                {primary.label}
              </p>
              <p className="mt-1 text-base font-black leading-6 text-[var(--color-ink)]">
                {primary.event.playerName !== "—"
                  ? `${primary.event.playerName}の`
                  : ""}
                {primaryLabel}で {primary.score.home}–{primary.score.away} に
              </p>
            </div>
          </div>
        )}
        {chips.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            {chips.map((chip, index) => (
              <div
                className={cn(
                  "rounded-[var(--radius-sm)] bg-white p-4 shadow-[var(--shadow-soft)]",
                  index === 1 && "bg-[#ebeff8]",
                )}
                key={chip.key}
              >
                <p className="text-xs font-bold text-[var(--color-ink-muted)]">
                  {chip.label}
                </p>
                <p
                  className={cn(
                    "mt-1.5 text-sm font-bold text-[var(--color-ink)]",
                    index === 1 && "text-[#38589f]",
                  )}
                >
                  {chip.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mt-8 border-t border-[var(--color-rule)] pt-6">
      <div className="mb-4">
        <h2 className="text-base font-black text-[var(--color-ink)]">
          得点推移
        </h2>
      </div>

      {timeline.length > 1 && (
        <div className="mb-4">
          <ScoreGraph
            awayTeamSlug={awayTeamSlug}
            finalAwayScore={finalAwayScore}
            finalHomeScore={finalHomeScore}
            homeTeamSlug={homeTeamSlug}
            timeline={timeline}
          />
        </div>
      )}

      <details className="mt-4 rounded-[var(--radius-sm)] bg-[var(--color-paper)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold text-[var(--color-ink)]">
          すべての得点・カード
        </summary>
        <div className="mt-4">
          <div className="mb-2 grid grid-cols-[1fr_2.5rem_1fr] gap-2 text-xs font-semibold text-[var(--color-ink-muted)]">
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
                >
                  <span
                    className="min-w-0 truncate text-xs text-[var(--color-ink)] sm:text-sm"
                    style={
                      isHome
                        ? {
                            borderLeft: `3px solid ${teamColor}`,
                            paddingLeft: "8px",
                          }
                        : undefined
                    }
                    title={isHome ? label : ""}
                  >
                    {isHome ? label : ""}
                  </span>
                  <span className="text-center text-xs font-semibold tabular-nums text-[var(--color-ink-muted)]">
                    {event.minute !== null ? `${event.minute}'` : "—"}
                  </span>
                  <span
                    className="min-w-0 truncate text-right text-xs text-[var(--color-ink)] sm:text-sm"
                    style={
                      !isHome
                        ? {
                            borderRight: `3px solid ${teamColor}`,
                            paddingRight: "8px",
                          }
                        : undefined
                    }
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
        </div>
      </details>
    </section>
  );
}
