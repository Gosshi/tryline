import {
  listFamilies,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { listAllMatchIds } from "@/lib/db/queries/matches";
import { listAllPlayerSlugs } from "@/lib/db/queries/players";
import { listAllTeams } from "@/lib/db/queries/teams";
import { SITE_URL } from "@/lib/site";

import type { MetadataRoute } from "next";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const [families, matchIds, playerSlugs, teams] = await Promise.all([
    listFamilies(),
    listAllMatchIds(),
    listAllPlayerSlugs(),
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
    lastModified: new Date(),
    priority: 0.7,
    url: `${base}/matches/${match.id}`,
  }));
  const enMatchPages = matchIds
    .filter((match) => match.competitionFamily === "league-one")
    .map((match) => ({
      changeFrequency: "weekly" as const,
      lastModified: new Date(),
      priority: 0.7,
      url: `${base}/matches/${match.id}/en`,
    }));
  const teamPages = teams.map((team) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(),
    priority: 0.7,
    url: `${base}/t/${team.slug}`,
  }));
  const playerPages = playerSlugs.map((slug) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(),
    priority: 0.6,
    url: `${base}/players/${slug}`,
  }));
  const staticPages = [
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
    ...matchPages,
    ...enMatchPages,
    ...teamPages,
    ...playerPages,
    ...staticPages,
  ];
}
