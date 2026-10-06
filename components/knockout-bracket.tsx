import Link from "next/link";

import { HomepageSpoilerScore } from "@/components/home-user-state";
import { formatKickoffJst } from "@/lib/format/kickoff";
import { getTeamColor } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { CSSProperties } from "react";

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

  return Array.from(
    { length: round.slots },
    (_, index) => roundMatches[index] ?? null,
  );
}

export function KnockoutBracket({ matches }: Props) {
  return (
    <div className="tl-knockout-grid grid gap-4 lg:grid-cols-4 lg:gap-5">
      {BRACKET_ROUNDS.map((round) => {
        const slots = buildRoundSlots(matches, round);

        return (
          <section
            className="tl-knockout-round min-w-0 border border-[var(--color-rule)]"
            key={round.key}
          >
            <header className="tl-knockout-heading relative overflow-hidden px-5 py-5">
              <span
                aria-hidden="true"
                className="tl-knockout-number absolute right-3 top-1 font-number text-6xl italic tabular-nums"
              >
                {String(round.round).padStart(2, "0")}
              </span>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                Knockout
              </p>
              <h2 className="relative mt-2 font-heading text-xl font-extrabold tracking-tight">
                {round.label}
              </h2>
            </header>

            <div className="space-y-3 p-3">
              {slots.map((match, index) =>
                match ? (
                  <Link
                    className="tl-knockout-match relative block overflow-hidden border border-[var(--color-rule)] px-4 pb-4 pt-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    style={
                      {
                        "--home-color": getTeamColor(match.homeTeam.slug),
                        "--away-color": getTeamColor(match.awayTeam.slug),
                      } as CSSProperties
                    }
                    href={`/matches/${match.id}`}
                    key={match.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold leading-relaxed text-[var(--color-ink)]">
                          {match.homeTeam.shortCode} 対{" "}
                          {match.awayTeam.shortCode}
                        </p>
                        <p className="mt-2 font-number text-sm tabular-nums text-[var(--color-ink-muted)]">
                          {match.status === "finished"
                            ? <HomepageSpoilerScore location="knockout_bracket">{`${match.homeScore ?? 0} – ${match.awayScore ?? 0}`}</HomepageSpoilerScore>
                            : formatKickoffJst(
                                match.kickoffAt,
                                match.kickoffTimeTbd,
                              )}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-sm px-2 py-1 text-[11px] font-medium",
                          match.status === "finished"
                            ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                            : "bg-[var(--color-panel)] text-[var(--color-ink-muted)]",
                        )}
                      >
                        {match.status === "finished" ? "FT" : "予定"}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div
                    className="border border-dashed border-[var(--color-rule)] bg-[var(--color-panel)] p-4 text-sm text-[var(--color-ink-muted)]"
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
