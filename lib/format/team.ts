import { JAPANESE_TEAM_NAMES_BY_SLUG } from "@/lib/format/japanese-names";

export type TeamDisplayInput = {
  name: string;
  nameJa?: string | null;
  slug?: string | null;
};

export function getTeamDisplayName(
  team: TeamDisplayInput,
  language: "ja" | "en" = "ja",
): string {
  if (language === "en") {
    return team.name;
  }

  return (
    team.nameJa ??
    (team.slug ? JAPANESE_TEAM_NAMES_BY_SLUG[team.slug] : undefined) ??
    team.name
  );
}
