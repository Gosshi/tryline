import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type WorldRugbyCompetitionFamily = "pnc" | "autumn-nations";

export type WorldRugbyMatchEntry = {
  world_rugby_match_id: string;
  competition_family: string;
  season: string;
  round: number | null;
  kickoff_at: string;
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  match_url: string;
};

type WorldRugbyTeam = {
  name?: unknown;
};

type WorldRugbyScheduleMatch = {
  matchId?: unknown;
  matchAltId?: unknown;
  description?: unknown;
  venue?: {
    name?: unknown;
    city?: unknown;
    country?: unknown;
  } | null;
  time?: {
    millis?: unknown;
  } | null;
  teams?: unknown;
  scores?: unknown;
  status?: unknown;
};

type WorldRugbySchedulePayload = {
  event?: {
    label?: unknown;
  };
  matches?: unknown;
};

const WORLD_RUGBY_BASE_URL = "https://www.world.rugby";
const WORLD_RUGBY_API_BASE_URL =
  "https://api.wr-rims-prod.pulselive.com/rugby/v3";
const WORLD_RUGBY_API_HEADERS = {
  account: "worldrugby",
  "X-Pulse-Application-Name": "worldrugby",
  "X-Pulse-Application-Version": "1.6.30",
};

export const TEAM_SLUG_BY_WORLD_RUGBY_NAME: Record<string, string> = {
  Argentina: "argentina",
  "Argentina A": "argentina",
  Australia: "australia",
  "Australia A": "australia",
  Canada: "canada",
  Chile: "chile",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Georgia: "georgia",
  "Hong Kong": "hong-kong",
  "Hong Kong China": "hong-kong",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  "Japan A": "japan",
  "Japan XV": "japan",
  "New Zealand": "new-zealand",
  "New Zealand A": "new-zealand",
  Portugal: "portugal",
  Samoa: "samoa",
  Scotland: "scotland",
  Spain: "spain",
  "South Africa": "south-africa",
  Tonga: "tonga",
  Uruguay: "uruguay",
  USA: "usa",
  "United States": "usa",
  "United States of America": "usa",
  Wales: "wales",
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

function resolveCompetitionFamily(label: unknown): WorldRugbyCompetitionFamily {
  const normalized = normalizeWhitespace(asString(label) ?? "").toLowerCase();

  if (
    normalized.includes("nations cup") ||
    normalized.includes("pacific nations cup")
  ) {
    return "pnc";
  }

  if (normalized.includes("autumn nations")) {
    return "autumn-nations";
  }

  throw new Error(`Unknown World Rugby competition label: ${String(label)}`);
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WORLD_RUGBY_NAME[normalizeWhitespace(teamName)];

  if (!slug) {
    throw new Error(`Unknown World Rugby team name: ${teamName}`);
  }

  return slug;
}

function parseRound(description: unknown) {
  const match = (asString(description) ?? "").match(/\bmatch\s+(\d+)\b/i);

  return match ? Number(match[1]) : null;
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

function parseMatchTeams(teams: unknown) {
  if (!Array.isArray(teams) || teams.length < 2) {
    throw new Error("World Rugby schedule match is missing teams.");
  }

  const homeName = asString((teams[0] as WorldRugbyTeam | undefined)?.name);
  const awayName = asString((teams[1] as WorldRugbyTeam | undefined)?.name);

  if (!homeName || !awayName) {
    throw new Error("World Rugby schedule match is missing team names.");
  }

  return {
    away_team_slug: resolveTeamSlug(awayName),
    home_team_slug: resolveTeamSlug(homeName),
  };
}

function parseScores(scores: unknown) {
  if (!Array.isArray(scores) || scores.length < 2) {
    return null;
  }

  const homeScore = asNumber(scores[0]);
  const awayScore = asNumber(scores[1]);

  if (homeScore === null || awayScore === null) {
    return null;
  }

  return {
    away_score: awayScore,
    home_score: homeScore,
  };
}

function parseKickoffAt(match: WorldRugbyScheduleMatch) {
  const millis = asNumber(match.time?.millis);

  if (millis === null) {
    throw new Error("World Rugby schedule match is missing kickoff millis.");
  }

  return new Date(millis).toISOString();
}

function getMatchId(match: WorldRugbyScheduleMatch) {
  return asString(match.matchId) ?? asString(match.matchAltId);
}

export function parseWorldRugbySchedulePayload(
  payload: WorldRugbySchedulePayload,
  season: string,
): WorldRugbyMatchEntry[] {
  const family = resolveCompetitionFamily(payload.event?.label);

  if (!Array.isArray(payload.matches)) {
    throw new Error("World Rugby schedule payload is missing matches.");
  }

  const entries = payload.matches.flatMap((rawMatch) => {
    const match = rawMatch as WorldRugbyScheduleMatch;
    const matchId = getMatchId(match);
    const scores = parseScores(match.scores);

    if (!matchId || match.status !== "C" || !scores) {
      return [];
    }

    return [
      {
        ...parseMatchTeams(match.teams),
        ...scores,
        competition_family: family,
        kickoff_at: parseKickoffAt(match),
        match_url: `${WORLD_RUGBY_BASE_URL}/match/${matchId}`,
        round: parseRound(match.description),
        season,
        venue: formatVenue(match),
        world_rugby_match_id: matchId,
      },
    ];
  });

  return entries.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
}

export function parseWorldRugbyTournamentId(html: string) {
  const $ = load(html);
  const tournamentId = $('[data-widget="schedule/match-list-root"]')
    .first()
    .attr("data-tournament-id");

  return tournamentId ? normalizeWhitespace(tournamentId) : null;
}

export async function fetchWorldRugbySchedule(
  competitionId: string,
  season: string,
): Promise<WorldRugbyMatchEntry[]> {
  const response = await fetchWithPolicy(
    `${WORLD_RUGBY_API_BASE_URL}/event/${competitionId}/schedule`,
    { headers: WORLD_RUGBY_API_HEADERS },
  );
  const payload = (await response.json()) as WorldRugbySchedulePayload;
  const entries = parseWorldRugbySchedulePayload(payload, season);

  if (entries.length === 0) {
    throw new Error(`No finished World Rugby matches found for ${season}.`);
  }

  return entries;
}
