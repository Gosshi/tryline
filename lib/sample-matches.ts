import { listCachedSampleMatchIds } from "@/lib/db/queries/sample-matches";

export const PRIMARY_SAMPLE_MATCH_ID = "a06219be-9d24-486b-92a5-7f9f88ef8826";

export const FALLBACK_SAMPLE_MATCH_IDS = [
  PRIMARY_SAMPLE_MATCH_ID,
  "2f2463af-e5d4-4503-ae41-292e961dc6cc",
  "040cdb1a-74b6-41b1-906a-70ea06f2ad1c",
  "9b219d0d-7c5a-40e2-98cc-4deae50e4160",
  "e68ed3e7-d374-4f57-9dca-72148fa129cb",
  "41a8d58e-9a3f-45fc-b8db-a3e6130b695a",
  "f74d5e5b-de8f-4bb9-a53a-7d0b8726319f",
  "2cbc8b44-2404-42c0-8ea3-6e96cf4ac3f6",
] as const;

export const SAMPLE_MATCH_IDS = FALLBACK_SAMPLE_MATCH_IDS;

export async function getSampleMatchIds(): Promise<string[]> {
  try {
    const cachedIds = await listCachedSampleMatchIds();

    return cachedIds.length > 0 ? cachedIds : [...FALLBACK_SAMPLE_MATCH_IDS];
  } catch {
    return [...FALLBACK_SAMPLE_MATCH_IDS];
  }
}

export async function getPrimarySampleMatchId(): Promise<string> {
  const [primary] = await getSampleMatchIds();

  return primary ?? PRIMARY_SAMPLE_MATCH_ID;
}

export async function isSampleMatch(matchId: string): Promise<boolean> {
  if ((FALLBACK_SAMPLE_MATCH_IDS as readonly string[]).includes(matchId)) {
    return true;
  }

  return (await getSampleMatchIds()).includes(matchId);
}
