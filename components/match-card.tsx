import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { formatKickoffJst } from "@/lib/format/kickoff";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";

import type { MatchListItem } from "@/lib/db/queries/matches";

type MatchCardProps = {
  match: MatchListItem;
};

function getScoreline(match: MatchListItem) {
  if (match.status !== "finished") {
    return "—";
  }

  return `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`;
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <Link className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" href={`/matches/${match.id}`}>
      <Card className="h-full border-slate-200 transition-colors hover:border-slate-300 hover:bg-slate-50/70">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <StatusBadge status={match.status} />
            <time className="text-sm text-slate-600" dateTime={match.kickoffAt}>
              {formatKickoffJst(match.kickoffAt)}
            </time>
          </div>

          <div className="space-y-2 text-center">
            <p className="text-lg font-semibold tracking-tight text-slate-900">
              {match.homeTeam.shortCode} vs {match.awayTeam.shortCode}
            </p>
            <p
              className={cn(
                "text-2xl font-semibold",
                match.status === "finished" ? "text-slate-950" : "text-slate-500",
              )}
            >
              {getScoreline(match)}
            </p>
          </div>

          <p className="text-sm text-slate-600">{match.venue ?? "会場未定"}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
