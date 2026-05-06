import {
  listFamilies,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { listAllMatchIds } from "@/lib/db/queries/matches";

import type { MetadataRoute } from "next";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://tryline-six.vercel.app";
  const [families, matchIds] = await Promise.all([
    listFamilies(),
    listAllMatchIds(),
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
  const matchPages = matchIds.map((id) => ({
    changeFrequency: "weekly" as const,
    lastModified: new Date(),
    priority: 0.7,
    url: `${base}/matches/${id}`,
  }));

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
  ];
}
