import Link from "next/link";

import {
  formatMatchKickoffJst,
  getMatchLabel,
  isJapanMatch,
} from "@/lib/format/season-summary";

import type { MatchListItem } from "@/lib/db/queries/matches";

type JapanMatchesBlockProps = {
  headToHeadHrefByMatchId?: Record<string, string>;
  matches: MatchListItem[];
  maxItems?: number;
  note?: string | null;
  seasonHref: string;
};

export function JapanMatchesBlock({
  headToHeadHrefByMatchId,
  matches,
  seasonHref,
  maxItems = 6,
  note,
}: JapanMatchesBlockProps) {
  const japanMatches = matches
    .filter((match) => match.status !== "cancelled" && isJapanMatch(match))
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));

  if (japanMatches.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="japan-matches-heading" className="space-y-3">
      <h3
        className="font-heading text-base font-bold text-[var(--color-ink)]"
        id="japan-matches-heading"
      >
        日本代表の試合
      </h3>
      <ul className="space-y-2">
        {japanMatches.slice(0, maxItems).map((match) => {
          const headToHeadHref = headToHeadHrefByMatchId?.[match.id];

          return (
            <li key={match.id}>
              <div className="grid grid-cols-1 gap-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-white sm:grid-cols-[12.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
                <Link className="contents" href={`/matches/${match.id}`}>
                  <span className="text-sm tabular-nums text-[var(--color-ink-muted)]">
                    {formatMatchKickoffJst(match.kickoffAt)}
                  </span>
                  <span className="font-semibold text-[var(--color-ink)]">
                    {getMatchLabel(match)}
                    {match.status === "finished" &&
                    match.homeScore !== null &&
                    match.awayScore !== null
                      ? `　${match.homeScore}–${match.awayScore}`
                      : ""}
                  </span>
                </Link>
                {headToHeadHref && (
                  <Link
                    className="text-sm font-bold text-[var(--color-accent)] hover:underline"
                    href={headToHeadHref}
                  >
                    過去の対戦成績 →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {note && (
        <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {note}
        </p>
      )}
      {japanMatches.length > maxItems && (
        <Link
          className="inline-flex text-sm font-bold text-[var(--color-accent)]"
          href={seasonHref}
        >
          日本代表の全日程を見る →
        </Link>
      )}
    </section>
  );
}
