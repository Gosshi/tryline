import { describe, expect, it } from "vitest";

import { resolvePremiershipTeamSlug } from "@/lib/ingestion/sources/premiership-team-slugs";

describe("resolvePremiershipTeamSlug", () => {
  it.each(["Newcastle", "Newcastle Falcons", "Newcastle Red Bulls"])(
    "resolves %s to newcastle-falcons",
    (teamName) => {
      expect(resolvePremiershipTeamSlug(teamName)).toBe("newcastle-falcons");
    },
  );
});
