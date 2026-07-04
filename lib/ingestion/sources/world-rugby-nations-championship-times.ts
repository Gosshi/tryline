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

  if (!slug) {
    throw new Error(`Unknown Nations Championship team name: ${teamName}`);
  }

  return slug;
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

  return {
    awayTeamSlug: resolveTeamSlug(awayName),
    homeTeamSlug: resolveTeamSlug(homeName),
  };
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

  return payload.matches.map((rawMatch, index) => {
    const match = rawMatch as WorldRugbyScheduleMatch;
    const worldRugbyMatchId = getMatchId(match);

    if (!worldRugbyMatchId) {
      throw new Error("Nations Championship schedule match is missing match id.");
    }

    return {
      ...parseTeams(match.teams),
      kickoffAt: parseKickoffAt(match),
      round: Math.floor(index / 6) + 1,
      venue: formatVenue(match),
      worldRugbyMatchId,
    };
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
