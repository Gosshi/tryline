import { describe, expect, it } from "vitest";

import { isRetiredCompetitionFamily } from "@/lib/competitions/retired";
import { LIVE_COMPETITION_SOURCES } from "@/lib/ingestion/live-competitions";
describe("retired competition families", () => {
  it("retires Top 14 only", () => {
    expect(isRetiredCompetitionFamily("top-14")).toBe(true);
    for (const family of [
      "urc",
      "premiership",
      "league-one",
      null,
      undefined,
      "",
    ]) {
      expect(isRetiredCompetitionFamily(family)).toBe(false);
    }
  });
  it("removes the Top 14 source while retaining the other club leagues", () => {
    expect(LIVE_COMPETITION_SOURCES.some((s) => s.family === "top-14")).toBe(
      false,
    );
    for (const slug of [
      "urc-2026-27",
      "premiership-2026-27",
      "league-one-2026-27",
    ]) {
      expect(
        LIVE_COMPETITION_SOURCES.some((s) => s.competitionSlug === slug),
      ).toBe(true);
    }
  });
});
