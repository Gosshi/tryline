import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type WorldRugbyNationsChampionshipTime = {
  awayTeamSlug: string;
  kickoffAt: string;
  homeTeamSlug: string;
  round: number;
  venue: string | null;
  worldRugbyMatchId: string;
};

type WorldRugbyTeam = {
  name?: unknown;
};

type WorldRugbyScheduleMatch = {
  matchAltId?: unknown;
  matchId?: unknown;
  teams?: unknown;
  time?: {
    millis?: unknown;
  } | null;
  venue?: {
    city?: unknown;
    country?: unknown;
    name?: unknown;
  } | null;
};

type WorldRugbySchedulePayload = {
  event?: {
    label?: unknown;
  };
  matches?: unknown;
};

const WORLD_RUGBY_API_BASE_URL =
  "https://api.wr-rims-prod.pulselive.com/rugby/v3";
const WORLD_RUGBY_API_HEADERS = {
  account: "worldrugby",
  "X-Pulse-Application-Name": "worldrugby",
  "X-Pulse-Application-Version": "1.6.30",
};
const NATIONS_CHAMPIONSHIP_2026_EVENT_ID =
  "46294cf5-dee3-4234-957a-dbe1f08049f2";

const TEAM_SLUG_BY_WORLD_RUGBY_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  "New Zealand": "new-zealand",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Wales: "wales",
};

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WORLD_RUGBY_NAME[normalizeWhitespace(teamName)];

  return slug ?? null;
}

function parseTeams(teams: unknown) {
  if (!Array.isArray(teams) || teams.length < 2) {
    throw new Error("Nations Championship schedule match is missing teams.");
  }

  const homeName = asString((teams[0] as WorldRugbyTeam | undefined)?.name);
  const awayName = asString((teams[1] as WorldRugbyTeam | undefined)?.name);

  if (!homeName || !awayName) {
    throw new Error("Nations Championship schedule match is missing team names.");
  }

  const awayTeamSlug = resolveTeamSlug(awayName);
  const homeTeamSlug = resolveTeamSlug(homeName);

  if (!awayTeamSlug || !homeTeamSlug) {
    console.warn("Skipping Nations Championship schedule match with unknown team", {
      awayTeamName: awayName,
      homeTeamName: homeName,
    });
    return null;
  }

  return { awayTeamSlug, homeTeamSlug };
}

function getMatchId(match: WorldRugbyScheduleMatch) {
  return asString(match.matchId) ?? asString(match.matchAltId);
}

function parseKickoffAt(match: WorldRugbyScheduleMatch) {
  const millis = asNumber(match.time?.millis);

  if (millis === null) {
    throw new Error("Nations Championship schedule match is missing kickoff.");
  }

  return new Date(millis).toISOString();
}

function formatVenue(match: WorldRugbyScheduleMatch) {
  const parts = [
    asString(match.venue?.name),
    asString(match.venue?.city),
    asString(match.venue?.country),
  ]
    .map((part) => (part ? normalizeWhitespace(part) : null))
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
}

function parseScheduleMatch(
  rawMatch: unknown,
  index: number,
): WorldRugbyNationsChampionshipTime | null {
  try {
    const match = rawMatch as WorldRugbyScheduleMatch;
    const teams = parseTeams(match.teams);

    if (!teams) {
      return null;
    }

    const worldRugbyMatchId = getMatchId(match);

    if (!worldRugbyMatchId) {
      throw new Error("Nations Championship schedule match is missing match id.");
    }

    return {
      ...teams,
      kickoffAt: parseKickoffAt(match),
      round: Math.floor(index / 6) + 1,
      venue: formatVenue(match),
      worldRugbyMatchId,
    };
  } catch (error) {
    console.warn("Skipping invalid Nations Championship schedule match", {
      index,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function parseWorldRugbyNationsChampionshipSchedulePayload(
  payload: WorldRugbySchedulePayload,
): WorldRugbyNationsChampionshipTime[] {
  const label = normalizeWhitespace(asString(payload.event?.label) ?? "");

  if (!/Nations Championship 2026/i.test(label)) {
    throw new Error(`Unexpected Nations Championship event label: ${label}`);
  }

  if (!Array.isArray(payload.matches)) {
    throw new Error("Nations Championship schedule payload is missing matches.");
  }

  return payload.matches.flatMap((rawMatch, index) => {
    const match = parseScheduleMatch(rawMatch, index);
    return match ? [match] : [];
  });
}

export async function fetchNationsChampionship2026KickoffTimes(): Promise<
  WorldRugbyNationsChampionshipTime[]
> {
  const response = await fetchWithPolicy(
    `${WORLD_RUGBY_API_BASE_URL}/event/${NATIONS_CHAMPIONSHIP_2026_EVENT_ID}/schedule`,
    { headers: WORLD_RUGBY_API_HEADERS },
  );

  return parseWorldRugbyNationsChampionshipSchedulePayload(
    (await response.json()) as WorldRugbySchedulePayload,
  );
}
