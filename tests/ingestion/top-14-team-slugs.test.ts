import { describe, expect, it } from "vitest";

import {
  resolveTop14TeamSlug,
  TOP_14_TEAM_SLUG_BY_WIKIPEDIA_NAME,
} from "@/lib/ingestion/sources/top-14-team-slugs";

describe("Top 14 Wikipedia team slugs", () => {
  it("keeps every alias formerly duplicated by the results and live parsers", () => {
    expect(TOP_14_TEAM_SLUG_BY_WIKIPEDIA_NAME).toEqual({
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
    });
  });

  it("returns null for an unregistered team", () => {
    expect(resolveTop14TeamSlug("Provence")).toBeNull();
  });
});
