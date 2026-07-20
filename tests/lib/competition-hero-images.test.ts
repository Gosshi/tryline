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

  it("falls back to the default local visual for an unmapped family", () => {
    expect(getCompetitionHeroImage("nations-championship")).toBe(
      DEFAULT_COMPETITION_HERO,
    );
  });
});
