import type { Json } from "@/lib/db/types";

export const FIXTURE_IDENTIFIER_KEYS = [
  "match_url", // 306 rows / 306 distinct as of 2026-09-06
  "league_one_match_id", // 216 rows / 216 distinct as of 2026-09-06
  "world_rugby_match_id", // 90 rows / 90 distinct as of 2026-09-06
  "top14_lnr_id", // 21 rows / 21 distinct as of 2026-09-06
  "top14_lnr_match_path", // 21 rows / 21 distinct as of 2026-09-06
] as const;

// Wikipedia anchors can repeat within a season; these URLs identify pages or
// rounds, not fixtures. Keep them exclusively for identifier quality reports.
export const UNRELIABLE_IDENTIFIER_KEYS = [
  "wikipedia_event_id",
  "wikipedia_url",
  "top14_lnr_url",
] as const;

function extractIdentifiers(
  externalIds: Json,
  keys: readonly string[],
): string[] {
  if (
    typeof externalIds !== "object" ||
    externalIds === null ||
    Array.isArray(externalIds)
  ) {
    return [];
  }

  return keys.flatMap((key) => {
    const value = Object.hasOwn(externalIds, key)
      ? externalIds[key]
      : undefined;

    if (
      (typeof value === "string" && value.trim().length > 0) ||
      typeof value === "number"
    ) {
      return [`${key}=${value}`];
    }

    return [];
  });
}

export function extractFixtureIdentifiers(externalIds: Json): string[] {
  return extractIdentifiers(externalIds, FIXTURE_IDENTIFIER_KEYS);
}

export function extractUnreliableIdentifiers(externalIds: Json): string[] {
  return extractIdentifiers(externalIds, UNRELIABLE_IDENTIFIER_KEYS);
}
