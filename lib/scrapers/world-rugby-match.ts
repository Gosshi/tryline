import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type WorldRugbyPlayer = {
  jersey_number: number;
  player_name: string;
  team_side: "home" | "away";
};

export type WorldRugbyEvent = {
  minute: number | null;
  player_name: string;
  event_type: "try" | "conversion" | "penalty" | "drop_goal";
  team_side: "home" | "away";
};

export type WorldRugbyMatchDetail = {
  players: WorldRugbyPlayer[];
  events: WorldRugbyEvent[];
};

type WorldRugbySummaryPayload = {
  teams?: unknown;
};

type WorldRugbyTimelinePayload = {
  timeline?: unknown;
};

type WorldRugbyTeamSummary = {
  teamList?: {
    list?: unknown;
  } | null;
};

type WorldRugbyLineupItem = {
  number?: unknown;
  player?: {
    id?: unknown;
    name?: {
      display?: unknown;
    };
  } | null;
};

type WorldRugbyTimelineEvent = {
  type?: unknown;
  typeLabel?: unknown;
  group?: unknown;
  points?: unknown;
  playerId?: unknown;
  teamIndex?: unknown;
  time?: {
    secs?: unknown;
  } | null;
};

const WORLD_RUGBY_API_BASE_URL =
  "https://api.wr-rims-prod.pulselive.com/rugby/v3";
const WORLD_RUGBY_API_HEADERS = {
  account: "worldrugby",
  "X-Pulse-Application-Name": "worldrugby",
  "X-Pulse-Application-Version": "1.6.30",
};

const SCORING_EVENT_BY_TYPE: Record<string, WorldRugbyEvent["event_type"]> = {
  C2: "conversion",
  DG: "drop_goal",
  DPG: "drop_goal",
  P3: "penalty",
  PT: "try",
  T5: "try",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTeamSide(value: unknown): WorldRugbyPlayer["team_side"] | null {
  if (value === 0) {
    return "home";
  }

  if (value === 1) {
    return "away";
  }

  return null;
}

function parseJerseyNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(asString(value) ?? "", 10);

  return Number.isInteger(parsed) ? parsed : null;
}

function parseLineupItem(
  item: WorldRugbyLineupItem,
  teamSide: WorldRugbyPlayer["team_side"],
) {
  const jerseyNumber = parseJerseyNumber(item.number);
  const playerName = asString(item.player?.name?.display);
  const playerId = asString(item.player?.id);

  if (jerseyNumber === null || !playerName) {
    return null;
  }

  return {
    player: {
      jersey_number: jerseyNumber,
      player_name: normalizeWhitespace(playerName),
      team_side: teamSide,
    },
    playerId,
  };
}

function parsePlayers(summary: WorldRugbySummaryPayload) {
  if (!Array.isArray(summary.teams)) {
    throw new Error("World Rugby summary payload is missing teams.");
  }

  const playerNameById = new Map<string, string>();
  const players: WorldRugbyPlayer[] = [];

  summary.teams.slice(0, 2).forEach((rawTeam, teamIndex) => {
    const teamSide = parseTeamSide(teamIndex);
    const list = (rawTeam as WorldRugbyTeamSummary)?.teamList?.list;

    if (!teamSide || !Array.isArray(list)) {
      return;
    }

    for (const rawItem of list) {
      const parsed = parseLineupItem(rawItem as WorldRugbyLineupItem, teamSide);

      if (!parsed) {
        continue;
      }

      players.push(parsed.player);

      if (parsed.playerId) {
        playerNameById.set(parsed.playerId, parsed.player.player_name);
      }
    }
  });

  return { playerNameById, players };
}

function parseEventType(
  event: WorldRugbyTimelineEvent,
): WorldRugbyEvent["event_type"] | null {
  const type = asString(event.type);

  if (type && SCORING_EVENT_BY_TYPE[type]) {
    return SCORING_EVENT_BY_TYPE[type];
  }

  const typeLabel = normalizeWhitespace(asString(event.typeLabel) ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (typeLabel === "try" || typeLabel === "penalty try") {
    return "try";
  }

  if (typeLabel === "conversion") {
    return "conversion";
  }

  if (typeLabel === "penalty") {
    return "penalty";
  }

  if (typeLabel === "drop goal") {
    return "drop_goal";
  }

  return null;
}

function parseMinute(event: WorldRugbyTimelineEvent) {
  const secs = asNumber(event.time?.secs);

  if (secs === null) {
    return null;
  }

  return Math.floor(secs / 60);
}

function parseEvents(
  timeline: WorldRugbyTimelinePayload,
  playerNameById: Map<string, string>,
) {
  if (!Array.isArray(timeline.timeline)) {
    throw new Error("World Rugby timeline payload is missing timeline.");
  }

  return timeline.timeline.flatMap((rawEvent) => {
    const event = rawEvent as WorldRugbyTimelineEvent;
    const eventType = parseEventType(event);
    const points = asNumber(event.points);
    const teamSide = parseTeamSide(event.teamIndex);

    if (!eventType || !teamSide || points === null || points <= 0) {
      return [];
    }

    const playerId = asString(event.playerId);
    const playerName =
      playerId && playerNameById.has(playerId)
        ? playerNameById.get(playerId)
        : eventType === "try" && asString(event.type) === "PT"
          ? "Penalty try"
          : null;

    if (!playerName) {
      return [];
    }

    return [
      {
        event_type: eventType,
        minute: parseMinute(event),
        player_name: playerName,
        team_side: teamSide,
      },
    ];
  });
}

export function parseWorldRugbyMatchDetailPayloads(
  summary: WorldRugbySummaryPayload,
  timeline: WorldRugbyTimelinePayload,
): WorldRugbyMatchDetail {
  const { playerNameById, players } = parsePlayers(summary);
  const events = parseEvents(timeline, playerNameById);

  return { events, players };
}

export async function fetchWorldRugbyMatchDetail(
  matchId: string,
): Promise<WorldRugbyMatchDetail> {
  const [summaryResponse, timelineResponse] = await Promise.all([
    fetchWithPolicy(`${WORLD_RUGBY_API_BASE_URL}/match/${matchId}/summary`, {
      headers: WORLD_RUGBY_API_HEADERS,
    }),
    fetchWithPolicy(`${WORLD_RUGBY_API_BASE_URL}/match/${matchId}/timeline`, {
      headers: WORLD_RUGBY_API_HEADERS,
    }),
  ]);
  const detail = parseWorldRugbyMatchDetailPayloads(
    (await summaryResponse.json()) as WorldRugbySummaryPayload,
    (await timelineResponse.json()) as WorldRugbyTimelinePayload,
  );

  if (detail.players.length === 0) {
    throw new Error(`No World Rugby lineups found for match ${matchId}.`);
  }

  return detail;
}
