import { revalidateTag } from "next/cache";

export const PUBLIC_DATA_CACHE_TAGS = {
  competitions: "public-data:competitions",
  content: "public-data:content",
  matches: "public-data:matches",
  standings: "public-data:standings",
  teams: "public-data:teams",
} as const;

export type PublicDataCacheTag =
  (typeof PUBLIC_DATA_CACHE_TAGS)[keyof typeof PUBLIC_DATA_CACHE_TAGS];

export type PublicDataRevalidationResult = {
  revalidatedTags: PublicDataCacheTag[];
  skippedTags: PublicDataCacheTag[];
};

export function revalidatePublicData(
  ...tags: PublicDataCacheTag[]
): PublicDataRevalidationResult {
  const revalidatedTags: PublicDataCacheTag[] = [];
  const skippedTags: PublicDataCacheTag[] = [];

  for (const tag of new Set(tags)) {
    try {
      revalidateTag(tag);
      revalidatedTags.push(tag);
    } catch (error) {
      skippedTags.push(tag);
      console.warn("[public-data-cache] revalidation skipped", {
        error,
        tag,
      });
    }
  }

  return { revalidatedTags, skippedTags };
}
