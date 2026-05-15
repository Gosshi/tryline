export const WIKIPEDIA_TEAM_NAME_MAP: Record<string, string> = {
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
  Northampton: "Northampton Saints",
  Sale: "Sale Sharks",
};

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
