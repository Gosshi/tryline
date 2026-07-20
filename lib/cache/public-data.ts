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

export function revalidatePublicData(...tags: PublicDataCacheTag[]) {
  for (const tag of new Set(tags)) {
    revalidateTag(tag);
  }
}
