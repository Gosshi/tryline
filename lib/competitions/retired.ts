export const RETIRED_COMPETITION_FAMILIES = ["top-14"] as const;

export function isRetiredCompetitionFamily(
  family: string | null | undefined,
): boolean {
  return RETIRED_COMPETITION_FAMILIES.some((retired) => retired === family);
}
