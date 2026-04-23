import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKickoffJst, formatKickoffLocal } from "@/lib/format/kickoff";

import { StatusBadge } from "./status-badge";

import type { MatchDetail } from "@/lib/db/queries/matches";

type MatchHeaderProps = {
  match: MatchDetail;
};

const TEAM_TIMEZONES: Record<string, string> = {
  england: "Europe/London",
  france: "Europe/Paris",
  ireland: "Europe/Dublin",
  italy: "Europe/Rome",
  scotland: "Europe/London",
  wales: "Europe/London",
};

function getVenueTimezone(teamSlug: string) {
  return TEAM_TIMEZONES[teamSlug] ?? "Europe/London";
}

function getScoreline(match: MatchDetail) {
  if (match.status !== "finished") {
    return "—";
  }

  return `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`;
}

export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);

  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl tracking-tight text-slate-950">
              {match.homeTeam.name} vs {match.awayTeam.name}
            </CardTitle>
            <p className="text-sm text-slate-600">
              {match.homeTeam.shortCode} vs {match.awayTeam.shortCode}
            </p>
          </div>
          <StatusBadge status={match.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Score</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            {getScoreline(match)}
          </p>
        </div>

        <div className="grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium text-slate-900">キックオフ（JST）</p>
            <time className="block" dateTime={match.kickoffAt}>
              {formatKickoffJst(match.kickoffAt)}
            </time>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-slate-900">現地時刻</p>
            <time className="block" dateTime={match.kickoffAt}>
              {formatKickoffLocal(match.kickoffAt, localTimezone)}
            </time>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-slate-900">会場</p>
            <p>{match.venue ?? "会場未定"}</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-slate-900">節</p>
            <p>{match.round === null ? "節未定" : `第 ${match.round} 節`}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
