import type { MatchLineupPlayer } from "@/lib/db/queries/match-lineups";

type MatchLineupsSectionProps = {
  players: MatchLineupPlayer[];
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};

export function MatchLineupsSection({
  players,
  homeTeamId,
  homeTeamName,
  awayTeamName,
}: MatchLineupsSectionProps) {
  if (players.length === 0) {
    return null;
  }

  const homePlayers = players.filter((player) => player.teamId === homeTeamId);
  const awayPlayers = players.filter((player) => player.teamId !== homeTeamId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
      <div className="mb-5 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Team Sheets
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          出場選手
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <PlayerColumn name={homeTeamName} players={homePlayers} />
        <PlayerColumn name={awayTeamName} players={awayPlayers} />
      </div>
    </section>
  );
}

function PlayerColumn({
  name,
  players,
}: {
  name: string;
  players: MatchLineupPlayer[];
}) {
  const starters = players.filter((player) => player.isStarter);
  const bench = players.filter((player) => !player.isStarter);

  return (
    <div className="min-w-0">
      <p className="mb-3 truncate text-sm font-semibold text-slate-700">
        {name}
      </p>

      <div className="space-y-1">
        {starters.map((player) => (
          <PlayerRow key={player.jerseyNumber} player={player} tone="starter" />
        ))}
      </div>

      {bench.length > 0 && (
        <>
          <div className="my-3 h-px bg-slate-100" />
          <div className="space-y-1">
            {bench.map((player) => (
              <PlayerRow
                key={player.jerseyNumber}
                player={player}
                tone="bench"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  tone,
}: {
  player: MatchLineupPlayer;
  tone: "starter" | "bench";
}) {
  const isBench = tone === "bench";

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-2 py-0.5">
      <span
        className={
          isBench
            ? "text-right text-xs font-medium tabular-nums text-slate-300"
            : "text-right text-xs font-semibold tabular-nums text-slate-400"
        }
      >
        {player.jerseyNumber}
      </span>
      <span
        className={
          isBench
            ? "min-w-0 text-sm text-slate-500"
            : "min-w-0 text-sm text-slate-700"
        }
      >
        <span className="truncate">{player.playerName}</span>
        {player.position && (
          <span className="ml-2 text-xs text-slate-400">{player.position}</span>
        )}
      </span>
    </div>
  );
}
