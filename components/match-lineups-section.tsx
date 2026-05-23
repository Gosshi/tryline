"use client";

import Link from "next/link";
import { useState } from "react";

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
        <h2 className="text-lg font-bold tracking-tight text-slate-950">
          出場選手
        </h2>
      </div>

      <div className="md:hidden">
        <MobileLineupTabs
          awayPlayers={awayPlayers}
          awayTeamName={awayTeamName}
          homePlayers={homePlayers}
          homeTeamName={homeTeamName}
        />
      </div>

      <div className="hidden gap-6 md:grid md:grid-cols-2">
        <PlayerColumn name={homeTeamName} players={homePlayers} />
        <PlayerColumn name={awayTeamName} players={awayPlayers} />
      </div>
    </section>
  );
}

function MobileLineupTabs({
  awayPlayers,
  awayTeamName,
  homePlayers,
  homeTeamName,
}: {
  awayPlayers: MatchLineupPlayer[];
  awayTeamName: string;
  homePlayers: MatchLineupPlayer[];
  homeTeamName: string;
}) {
  const [activeTeam, setActiveTeam] = useState<"home" | "away">("home");
  const tabs = [
    { id: "home" as const, name: homeTeamName, players: homePlayers },
    { id: "away" as const, name: awayTeamName, players: awayPlayers },
  ];
  const activeTab = tabs.find((tab) => tab.id === activeTeam) ?? tabs[0]!;

  return (
    <div>
      <div
        aria-label="出場選手チーム切り替え"
        className="mb-4 grid grid-cols-2 rounded-full bg-slate-100 p-1"
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTeam;

          return (
            <button
              aria-selected={selected}
              className={
                selected
                  ? "min-w-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-950 shadow-sm"
                  : "min-w-0 rounded-full px-3 py-2 text-xs font-semibold text-slate-500"
              }
              key={tab.id}
              onClick={() => setActiveTeam(tab.id)}
              role="tab"
              type="button"
            >
              <span className="block truncate">{tab.name}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        <PlayerColumn name={activeTab.name} players={activeTab.players} />
      </div>
    </div>
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
          <div className="my-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs text-slate-400">控え</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
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
        {player.playerSlug ? (
          <Link
            className="inline-block max-w-full truncate align-bottom font-medium underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={`/players/${player.playerSlug}`}
          >
            {player.playerName}
          </Link>
        ) : (
          <span className="truncate">{player.playerName}</span>
        )}
        {player.position && (
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
            {player.position}
          </span>
        )}
      </span>
    </div>
  );
}
