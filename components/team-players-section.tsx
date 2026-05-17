import Link from "next/link";

import {
  getPositionGroup,
  POSITION_GROUP_LABEL,
} from "@/lib/utils/rugby-positions";

import type { TeamPlayerItem } from "@/lib/db/queries/players";
import type { PositionGroup } from "@/lib/utils/rugby-positions";

type TeamPlayersSectionProps = {
  players: TeamPlayerItem[];
};

const GROUP_ORDER: PositionGroup[] = ["fw", "bk", "unknown"];

export function TeamPlayersSection({ players }: TeamPlayersSectionProps) {
  if (players.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        選手データがありません
      </p>
    );
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: POSITION_GROUP_LABEL[group],
    players: players.filter(
      (player) => getPositionGroup(player.position) === group,
    ),
  })).filter(({ players }) => players.length > 0);

  return (
    <div className="space-y-6">
      {grouped.map(({ group, label, players: groupPlayers }) => (
        <div key={group}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            {label}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {groupPlayers.map((player) => (
              <Link
                className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                href={`/players/${player.slug}`}
                key={player.slug}
              >
                <span className="truncate font-medium text-[var(--color-ink)]">
                  {player.name}
                </span>
                {player.position && (
                  <span className="truncate text-xs text-[var(--color-ink-muted)]">
                    {player.position}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
