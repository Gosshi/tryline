import {
  listFamilies,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import {
  listHeadToHeadPairs,
  listMatchIdsWithContent,
  listRoundHubParams,
} from "@/lib/db/queries/matches";
import { listIndexablePlayerSlugs } from "@/lib/db/queries/players";
import { listAllTeams } from "@/lib/db/queries/teams";
import { SITE_URL } from "@/lib/site";

import type { MetadataRoute } from "next";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const [families, headToHeadPairs, matchIds, playerSlugs, roundHubs, teams] =
    await Promise.all([
      listFamilies(),
      listHeadToHeadPairs(),
      listMatchIdsWithContent(),
      listIndexablePlayerSlugs(),
      listRoundHubParams(),
      listAllTeams(),
    ]);
  const seasonPages = (
    await Promise.all(
      families.map(async (family) => {
        const seasons = await listSeasonsByFamily(family);

        return seasons.map((season) => ({
          changeFrequency: "daily" as const,
          lastModified: new Date(),
          priority: 0.8,
          url: `${base}/c/${family}/${season.season}`,
        }));
      }),
    )
  ).flat();
  const familyPages = families.map((family) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(),
    priority: 0.6,
    url: `${base}/c/${family}`,
  }));
  const matchPages = matchIds.map((match) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(match.updatedAt),
    priority: 0.7,
    url: `${base}/matches/${match.id}`,
  }));
  const enMatchPages = matchIds
    .filter((match) => match.competitionFamily === "league-one")
    .map((match) => ({
      changeFrequency: "weekly" as const,
      lastModified: new Date(match.updatedAt),
      priority: 0.7,
      url: `${base}/matches/${match.id}/en`,
    }));
  const roundHubPages = roundHubs.map((roundHub) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(roundHub.updatedAt),
    priority: 0.65,
    url: `${base}/c/${roundHub.competition}/${roundHub.season}/round/${roundHub.round}`,
  }));
  const headToHeadPages = headToHeadPairs.map((pair) => ({
    changeFrequency: "monthly" as const,
    lastModified: new Date(pair.updatedAt),
    priority: 0.5,
    url: `${base}/h2h/${pair.slug}`,
  }));
  const teamPages = teams.map((team) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(),
    priority: 0.7,
    url: `${base}/teams/${team.slug}`,
  }));
  const playerPages = playerSlugs.map((slug) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(),
    priority: 0.6,
    url: `${base}/players/${slug}`,
  }));
  const staticPages = [
    {
      changeFrequency: "daily" as const,
      lastModified: new Date(),
      priority: 0.8,
      url: `${base}/calendar`,
    },
    {
      changeFrequency: "monthly" as const,
      lastModified: new Date(),
      priority: 0.5,
      url: `${base}/pricing`,
    },
  ];

  return [
    {
      changeFrequency: "daily",
      lastModified: new Date(),
      priority: 1,
      url: base,
    },
    ...familyPages,
    ...seasonPages,
    ...roundHubPages,
    ...headToHeadPages,
    ...matchPages,
    ...enMatchPages,
    ...teamPages,
    ...playerPages,
    ...staticPages,
  ];
}
