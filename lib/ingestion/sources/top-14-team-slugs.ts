export const TOP_14_TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Bayonne: "bayonne",
  "Bordeaux Bègles": "bordeaux-begles",
  Castres: "castres",
  Clermont: "clermont",
  Grenoble: "grenoble",
  "La Rochelle": "la-rochelle",
  Lyon: "lyon",
  Montpellier: "montpellier",
  Pau: "pau",
  Perpignan: "perpignan",
  Racing: "racing-92",
  "Racing 92": "racing-92",
  "Stade Français": "stade-francais",
  Toulon: "toulon",
  Toulouse: "toulouse",
  Vannes: "vannes",
};

export function resolveTop14TeamSlug(teamName: string) {
  return TOP_14_TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName] ?? null;
}
