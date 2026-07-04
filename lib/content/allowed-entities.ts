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
