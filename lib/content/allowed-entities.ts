import { hasConfirmedEntry } from "@/lib/llm/lineups";

import type { AssembledContentInput } from "@/lib/llm/types";

export type AllowedPersonEntity = {
  name: string;
  source: "lineup" | "event";
};

function normalizeEntityName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function appendEntity(
  entities: AllowedPersonEntity[],
  seen: Set<string>,
  entity: AllowedPersonEntity,
) {
  const name = normalizeEntityName(entity.name);
  if (!name) {
    return;
  }

  const key = name.toLocaleLowerCase();
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  entities.push({ ...entity, name });
}

function appendName(names: string[], seen: Set<string>, value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const name = normalizeEntityName(value);

  if (!name) {
    return;
  }

  const key = name.toLocaleLowerCase();

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  names.push(name);
}

function sideHasConfirmedLineup(
  lineups: AssembledContentInput["projected_lineups"],
  side: "home" | "away",
) {
  if (lineups.confirmed) {
    return lineups.confirmed[side];
  }

  return hasConfirmedEntry(lineups[side]);
}

export function buildAllowedPersonEntities(
  assembled: AssembledContentInput,
): AllowedPersonEntity[] {
  const entities: AllowedPersonEntity[] = [];
  const seen = new Set<string>();
  const lineups = assembled.projected_lineups;

  for (const side of ["home", "away"] as const) {
    if (!sideHasConfirmedLineup(lineups, side)) {
      continue;
    }

    for (const player of lineups[side]) {
      appendEntity(entities, seen, {
        name: player.name,
        source: "lineup",
      });
    }
  }

  for (const event of assembled.match_events) {
    appendEntity(entities, seen, {
      name: event.player_name,
      source: "event",
    });
  }

  return entities;
}

export function buildKnownNonPersonNames(
  assembled: AssembledContentInput,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const team of [assembled.match.home_team, assembled.match.away_team]) {
    appendName(names, seen, team?.name);
    appendName(names, seen, team?.name_ja);
    appendName(names, seen, team?.english_name);
  }

  const competition = assembled.match.competition;
  appendName(names, seen, competition?.name);
  appendName(names, seen, competition?.name_ja);
  appendName(names, seen, competition?.season);

  for (const side of ["home", "away"] as const) {
    for (const match of assembled.recent_form[side]) {
      appendName(names, seen, match.home_team_name);
      appendName(names, seen, match.away_team_name);
    }
  }

  for (const match of assembled.h2h_last_5) {
    appendName(names, seen, match.home_team_name);
    appendName(names, seen, match.away_team_name);
  }

  for (const standing of assembled.competition_standings) {
    appendName(names, seen, standing.team_name);
  }

  for (const entry of assembled.japanese_name_glossary ?? []) {
    appendName(names, seen, entry.source);
    appendName(names, seen, entry.japanese);
  }

  return names;
}
