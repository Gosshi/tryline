import Link from "next/link";

import {
  formatMatchKickoffJst,
  getMatchLabel,
} from "@/lib/format/season-summary";

import type { MatchListItem } from "@/lib/db/queries/matches";

type JapanMatchesBlockProps = {
  matches: MatchListItem[];
  seasonHref: string;
  maxItems?: number;
};

export function JapanMatchesBlock({
  matches,
  seasonHref,
  maxItems = 6,
}: JapanMatchesBlockProps) {
  if (matches.length === 0) {
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
        {matches.slice(0, maxItems).map((match) => (
          <li key={match.id}>
            <Link
              className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
              href={`/matches/${match.id}`}
            >
              <span className="font-semibold text-[var(--color-ink)]">
                {getMatchLabel(match)}
                {match.status === "finished" &&
                match.homeScore !== null &&
                match.awayScore !== null
                  ? `　${match.homeScore}–${match.awayScore}`
                  : ""}
              </span>
              <span className="text-sm tabular-nums text-[var(--color-ink-muted)]">
                {formatMatchKickoffJst(match.kickoffAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {matches.length > maxItems && (
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
