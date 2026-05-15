export const WIKIPEDIA_TEAM_NAME_MAP: Record<string, string> = {
  Argentina: "Argentina",
  Australia: "Australia",
  Bayonne: "Aviron Bayonnais",
  "Bath Rugby": "Bath Rugby",
  "Bordeaux Bègles": "Union Bordeaux Bègles",
  Bristol: "Bristol Bears",
  Cardiff: "Cardiff Rugby",
  Castres: "Castres Olympique",
  Clermont: "ASM Clermont Auvergne",
  Edinburgh: "Edinburgh Rugby",
  Exeter: "Exeter Chiefs",
  Glasgow: "Glasgow Warriors",
  Gloucester: "Gloucester Rugby",
  Grenoble: "FC Grenoble",
  "La Rochelle": "La Rochelle",
  Leicester: "Leicester Tigers",
  Lyon: "Lyon OU",
  Montpellier: "Montpellier Hérault Rugby",
  Newcastle: "Newcastle Falcons",
  "Newcastle Red Bulls": "Newcastle Falcons",
  "New Zealand": "New Zealand",
  Northampton: "Northampton Saints",
  Pau: "Section Paloise",
  Perpignan: "USA Perpignan",
  Racing: "Racing 92",
  "Racing 92": "Racing 92",
  Sale: "Sale Sharks",
  "South Africa": "South Africa",
  "Stade Francais": "Stade Français",
  "Stade Français": "Stade Français",
  Toulon: "RC Toulon",
  Toulouse: "Toulouse",
  Vannes: "RC Vannes",
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
