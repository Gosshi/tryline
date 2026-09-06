import { describe, expect, it } from "vitest";

import { computeEventPointTotals } from "@/lib/ingestion/event-integrity";

describe("computeEventPointTotals", () => {
  it("uses the shared match-event scoring rules for each team", () => {
    const totals = computeEventPointTotals(
      [
        { isPenaltyTry: false, teamId: "home", type: "try" },
        { isPenaltyTry: false, teamId: "home", type: "conversion" },
        { isPenaltyTry: true, teamId: "away", type: "try" },
        { isPenaltyTry: false, teamId: "away", type: "drop_goal" },
        { isPenaltyTry: false, teamId: "other", type: "penalty_goal" },
      ],
      {
        away: { id: "away", name: "Away" },
        home: { id: "home", name: "Home" },
      },
    );

    expect(totals).toEqual({ away: 10, home: 7 });
  });
});
