import { describe, expect, it } from "vitest";

import {
  getTeamColor,
  getTeamFlag,
  getTeamFlagSvg,
  getTeamStripe,
} from "@/lib/format/team-identity";

describe("team identity formatter", () => {
  it("returns subdivision flags instead of a bare black flag", () => {
    expect(getTeamFlag("england")).not.toBe("🏴");
    expect(getTeamFlag("scotland")).not.toBe("🏴");
    expect(getTeamFlag("wales")).not.toBe("🏴");
  });

  it("returns the rugby fallback for unknown teams", () => {
    expect(getTeamFlag("unknown")).toBe("🏉");
  });

  it("returns inline SVG flags and an empty fallback for unknown teams", () => {
    expect(getTeamFlagSvg("england")).toContain("<svg");
    expect(getTeamFlagSvg("wales")).toContain("viewBox");
    expect(getTeamFlagSvg("unknown")).toBe("");
  });

  it("returns team colors and a slate fallback for unknown teams", () => {
    expect(getTeamColor("ireland")).toBe("#009A44");
    expect(getTeamColor("unknown")).toBe("#94a3b8");
  });

  it("returns team flag stripes and a slate fallback for unknown teams", () => {
    expect(getTeamStripe("england")).toBe(
      "linear-gradient(to bottom, #CC0000 0%, #CC0000 50%, #FFFFFF 50%, #FFFFFF 100%)",
    );
    expect(getTeamStripe("france")).toBe(
      "linear-gradient(to bottom, #002395 0%, #002395 33%, #FFFFFF 33%, #FFFFFF 67%, #ED2939 67%, #ED2939 100%)",
    );
    expect(getTeamStripe("scotland", "horizontal")).toBe(
      "linear-gradient(to right, #003F87 0%, #003F87 50%, #FFFFFF 50%, #FFFFFF 100%)",
    );
    expect(getTeamStripe("wales", "horizontal")).toBe(
      "linear-gradient(to right, #C8102E 0%, #C8102E 33%, #FFFFFF 33%, #FFFFFF 67%, #00712D 67%, #00712D 100%)",
    );
    expect(getTeamStripe("unknown")).toBe("#94a3b8");
  });
});
