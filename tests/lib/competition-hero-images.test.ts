import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPETITION_HERO,
  getCompetitionHeroImage,
} from "@/lib/competition-hero-images";

describe("competition hero images", () => {
  it("returns the local visual for a mapped competition family", () => {
    expect(getCompetitionHeroImage("premiership")).toBe(
      "/visuals/premiership.jpg",
    );
  });

  it("returns the new local visuals for each mapped competition family", () => {
    expect(getCompetitionHeroImage("nations-championship")).toBe(
      "/visuals/nations-championship.jpg",
    );
    expect(getCompetitionHeroImage("greatest-rivalry")).toBe(
      "/visuals/greatest-rivalry.jpg",
    );
    expect(getCompetitionHeroImage("lipovitan-challenge-cup")).toBe(
      "/visuals/lipovitan-challenge-cup.jpg",
    );
    expect(getCompetitionHeroImage("puma-trophy")).toBe(
      "/visuals/rugby-championship.jpg",
    );
  });

  it("falls back to the default local visual for an unmapped family", () => {
    expect(getCompetitionHeroImage("unmapped-competition")).toBe(
      DEFAULT_COMPETITION_HERO,
    );
  });
});
