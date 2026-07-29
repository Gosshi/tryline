import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getMobileUserProfile } from "@/lib/api/v1/server";
import { getUserFromBearer, getSupabaseBearerClient } from "@/lib/auth/bearer";
import {
  getNextMatchesForTeams,
  getSingleNationCompetitionIds,
  type UpcomingMatch,
} from "@/lib/db/queries/matches";
import { getCompetitionDisplayName } from "@/lib/format/competition";

import type { V1NextMatchesData, V1NextReadMatch } from "@/lib/api/v1/types";

function mapNextReadMatch(
  match: UpcomingMatch,
  suppressFlags: boolean,
): V1NextReadMatch {
  return {
    away_team: {
      flag_code: suppressFlags ? null : (match.awayTeam.flagCode ?? null),
      id: match.awayTeam.id ?? null,
      name: match.awayTeam.name,
      score: match.awayScore,
      short_code: match.awayTeam.shortCode,
      slug: match.awayTeam.slug,
    },
    competition_name: getCompetitionDisplayName(match.competition),
    has_recap: false,
    home_team: {
      flag_code: suppressFlags ? null : (match.homeTeam.flagCode ?? null),
      id: match.homeTeam.id ?? null,
      name: match.homeTeam.name,
      score: match.homeScore,
      short_code: match.homeTeam.shortCode,
      slug: match.homeTeam.slug,
    },
    id: match.id,
    kickoff_utc: match.kickoffAt,
  };
}

export async function GET(request: Request) {
  const user = await getUserFromBearer(request);
  const client = user ? getSupabaseBearerClient(request) : null;

  if (!user || !client) {
    return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
  }

  const profile = await getMobileUserProfile(client, user.id);

  if (!profile) {
    return apiError("profile not found", 404, PRIVATE_CACHE_CONTROL);
  }

  if (profile.favoriteTeamSlugs.length === 0) {
    const data: V1NextMatchesData = { matches: [] };

    return apiSuccess(data, PRIVATE_CACHE_CONTROL);
  }

  const { data: teams, error: teamsError } = await client
    .from("teams")
    .select("id")
    .in("slug", profile.favoriteTeamSlugs);

  if (teamsError) {
    return apiError(
      "failed to resolve favorite teams",
      500,
      PRIVATE_CACHE_CONTROL,
    );
  }

  const teamIds = (teams ?? []).map((team) => team.id);

  if (teamIds.length === 0) {
    const data: V1NextMatchesData = { matches: [] };

    return apiSuccess(data, PRIVATE_CACHE_CONTROL);
  }

  const nextMatches = await getNextMatchesForTeams({
    afterIso: new Date().toISOString(),
    teamIds,
  });
  const seenMatchIds = new Set<string>();
  const uniqueMatches = nextMatches
    .map((entry) => entry.match)
    .filter((match) => {
      if (seenMatchIds.has(match.id)) {
        return false;
      }

      seenMatchIds.add(match.id);
      return true;
    });
  const competitionIds = uniqueMatches
    .map((match) => match.competition.id)
    .filter((competitionId): competitionId is string => competitionId !== undefined);
  const singleNationCompetitionIds =
    await getSingleNationCompetitionIds(competitionIds);
  const data: V1NextMatchesData = {
    matches: uniqueMatches.map((match) =>
      mapNextReadMatch(
        match,
        match.competition.id !== undefined &&
          singleNationCompetitionIds.has(match.competition.id),
      ),
    ),
  };

  return apiSuccess(data, PRIVATE_CACHE_CONTROL);
}
