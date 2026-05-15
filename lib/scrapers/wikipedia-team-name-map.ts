export const WIKIPEDIA_TEAM_NAME_MAP: Record<string, string> = {
  Argentina: "Argentina",
  Australia: "Australia",
  "Bath Rugby": "Bath Rugby",
  Bristol: "Bristol Bears",
  Cardiff: "Cardiff Rugby",
  Edinburgh: "Edinburgh Rugby",
  Exeter: "Exeter Chiefs",
  Glasgow: "Glasgow Warriors",
  Gloucester: "Gloucester Rugby",
  Leicester: "Leicester Tigers",
  Newcastle: "Newcastle Falcons",
  "Newcastle Red Bulls": "Newcastle Falcons",
  "New Zealand": "New Zealand",
  Northampton: "Northampton Saints",
  Sale: "Sale Sharks",
  "South Africa": "South Africa",
};

export const RC_WIKIPEDIA_TEAM_NAMES: readonly string[] = [
  "Argentina",
  "Australia",
  "New Zealand",
  "South Africa",
] as const;

export function normalizeWikipediaTeamName(name: string): string {
  return name
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\(\d+\s+BP\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapWikipediaTeamName(name: string): string {
  const normalized = normalizeWikipediaTeamName(name);

  return WIKIPEDIA_TEAM_NAME_MAP[normalized] ?? normalized;
}
