export const SAMPLE_MATCH_IDS = [
  "a06219be-9d24-486b-92a5-7f9f88ef8826",
  "2f2463af-e5d4-4503-ae41-292e961dc6cc",
  "040cdb1a-74b6-41b1-906a-70ea06f2ad1c",
  "9b219d0d-7c5a-40e2-98cc-4deae50e4160",
  "e68ed3e7-d374-4f57-9dca-72148fa129cb",
  "41a8d58e-9a3f-45fc-b8db-a3e6130b695a",
  "f74d5e5b-de8f-4bb9-a53a-7d0b8726319f",
  "2cbc8b44-2404-42c0-8ea3-6e96cf4ac3f6",
] as const;

const SAMPLE_MATCH_ID_SET = new Set<string>(SAMPLE_MATCH_IDS);

export function isSampleMatch(matchId: string): boolean {
  return SAMPLE_MATCH_ID_SET.has(matchId);
}
