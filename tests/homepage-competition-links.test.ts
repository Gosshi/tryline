import { describe, expect, it } from "vitest";

import { sortHomepageCompetitionLinks } from "@/lib/db/queries/competitions";

describe("sortHomepageCompetitionLinks", () => {
  it("prioritizes recently active competitions", () => {
    const result = sortHomepageCompetitionLinks(
      [
        {
          endDate: "2026-01-01",
          family: "six-nations",
          name: "Six Nations 2026",
          season: "2026",
        },
        {
          endDate: "2025-01-01",
          family: "autumn-nations",
          name: "Autumn Nations 2025",
          season: "2025",
        },
      ],
      new Date("2026-01-05T00:00:00.000Z"),
    );

    expect(result[0]?.family).toBe("six-nations");
  });
});
