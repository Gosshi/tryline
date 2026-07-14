import { apiSuccess, PUBLIC_CACHE_CONTROL } from "@/lib/api/v1/response";
import {
  listFamilies,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { getCompetitionDisplayName } from "@/lib/format/competition";

import type { V1Competition, V1CompetitionsData } from "@/lib/api/v1/types";

export async function GET() {
  const families = await listFamilies();
  const seasonsByFamily = await Promise.all(
    families.map((family) => listSeasonsByFamily(family)),
  );
  const competitions: V1Competition[] = seasonsByFamily.flatMap((seasons) =>
    seasons.map((competition) => ({
      end_date: competition.endDate,
      family: competition.family,
      match_count: competition.matchCount,
      name: getCompetitionDisplayName(competition),
      season: competition.season,
      slug: competition.slug,
      start_date: competition.startDate,
    })),
  );
  const data: V1CompetitionsData = { competitions };

  return apiSuccess(data, PUBLIC_CACHE_CONTROL);
}
