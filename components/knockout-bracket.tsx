import Link from "next/link";

import { formatKickoffJst } from "@/lib/format/kickoff";
import { cn } from "@/lib/utils";

import type { MatchListItem } from "@/lib/db/queries/matches";

type Props = {
  matches: MatchListItem[];
};

type BracketRound = {
  key: "quarterfinal" | "semifinal" | "bronze" | "final";
  label: string;
  round: number;
  slots: number;
};

const BRACKET_ROUNDS: BracketRound[] = [
  { key: "quarterfinal", label: "準々決勝", round: 5, slots: 4 },
  { key: "semifinal", label: "準決勝", round: 6, slots: 2 },
  { key: "bronze", label: "3位決定戦", round: 7, slots: 1 },
  { key: "final", label: "決勝", round: 8, slots: 1 },
];

function buildRoundSlots(matches: MatchListItem[], round: BracketRound) {
  const roundMatches = matches
    .filter((match) => match.round === round.round)
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));

  return Array.from({ length: round.slots }, (_, index) => roundMatches[index] ?? null);
}

export function KnockoutBracket({ matches }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-4 lg:gap-5">
      {BRACKET_ROUNDS.map((round) => {
        const slots = buildRoundSlots(matches, round);

        return (
          <section
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            key={round.key}
          >
            <header className="border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Knockout
              </p>
              <h2 className="mt-1 font-heading text-xl font-bold tracking-tight text-[var(--color-ink)]">
                {round.label}
              </h2>
            </header>

            <div className="space-y-3">
              {slots.map((match, index) =>
                match ? (
                  <Link
                    className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    href={`/matches/${match.id}`}
                    key={match.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                          {match.homeTeam.shortCode} 対 {match.awayTeam.shortCode}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                          {match.status === "finished"
                            ? `${match.homeScore ?? 0} – ${match.awayScore ?? 0}`
                            : formatKickoffJst(match.kickoffAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          match.status === "finished"
                            ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {match.status === "finished" ? "FT" : "予定"}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div
                    className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-400"
                    key={`${round.key}-${index}`}
                  >
                    TBD
                  </div>
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
