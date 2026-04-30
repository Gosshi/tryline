import Link from "next/link";

import { formatKickoffJst } from "@/lib/format/kickoff";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";

import type { MatchListItem } from "@/lib/db/queries/matches";

type MatchCardProps = {
  match: MatchListItem;
};

function getScoreline(match: MatchListItem): string {
  if (match.status !== "finished") {
    return "—";
  }

  return `${match.homeScore ?? 0} – ${match.awayScore ?? 0}`;
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <Link
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      href={`/matches/${match.id}`}
    >
      <article className="h-full rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 hover:bg-slate-50">
        <div className="mb-4 flex items-center justify-between gap-4">
          <time className="text-xs font-medium text-slate-500" dateTime={match.kickoffAt}>
            {formatKickoffJst(match.kickoffAt)}
          </time>
          <StatusBadge status={match.status} />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="text-right">
            <p className="text-xl font-bold text-slate-900">{match.homeTeam.shortCode}</p>
            <p className="text-xs leading-tight text-slate-400">{match.homeTeam.name}</p>
          </div>

          <p
            className={cn(
              "px-3 text-3xl font-bold tabular-nums",
              match.status === "finished" ? "text-slate-950" : "text-slate-300",
            )}
          >
            {getScoreline(match)}
          </p>

          <div className="text-left">
            <p className="text-xl font-bold text-slate-900">{match.awayTeam.shortCode}</p>
            <p className="text-xs leading-tight text-slate-400">{match.awayTeam.name}</p>
          </div>
        </div>

        {match.venue && <p className="mt-4 text-xs text-slate-400">{match.venue}</p>}
      </article>
    </Link>
  );
}
