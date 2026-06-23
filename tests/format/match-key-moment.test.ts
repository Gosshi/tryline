import { describe, expect, it } from "vitest";

import { deriveMatchEventHighlights } from "@/lib/format/match-key-moment";

const HOME_ID = "home";
const AWAY_ID = "away";

function event(
  id: string,
  minute: number | null,
  teamId: string,
  type: string,
) {
  return {
    id,
    minute,
    playerName: "Player",
    teamId,
    type,
  };
}

describe("deriveMatchEventHighlights", () => {
  it("selects the final lead-taking score that is never relinquished", () => {
    const result = deriveMatchEventHighlights({
      events: [
        event("home-try", 8, HOME_ID, "try"),
        event("away-try", 22, AWAY_ID, "try"),
        event("away-conversion", 23, AWAY_ID, "conversion"),
        event("home-penalty", 61, HOME_ID, "penalty_goal"),
      ],
      finalAwayScore: 7,
      finalHomeScore: 8,
      homeTeamId: HOME_ID,
    });

    expect(result.primary?.event.id).toBe("home-penalty");
    expect(result.primary?.label).toBe("リードを奪った得点");
    expect(result.primary?.score).toEqual({ away: 7, home: 8 });
  });

  it("uses the first score that creates a lead greater than eight in a wire-to-wire win", () => {
    const result = deriveMatchEventHighlights({
      events: [
        event("try", 4, HOME_ID, "try"),
        event("conversion", 5, HOME_ID, "conversion"),
        event("penalty", 18, HOME_ID, "penalty_goal"),
        event("away-try", 70, AWAY_ID, "try"),
      ],
      finalAwayScore: 5,
      finalHomeScore: 10,
      homeTeamId: HOME_ID,
    });

    expect(result.primary?.event.id).toBe("penalty");
    expect(result.primary?.label).toBe("リードを広げた得点");
  });

  it("hides the primary moment for a draw", () => {
    const result = deriveMatchEventHighlights({
      events: [
        event("home-penalty", 10, HOME_ID, "penalty_goal"),
        event("away-penalty", 75, AWAY_ID, "penalty_goal"),
      ],
      finalAwayScore: 3,
      finalHomeScore: 3,
      homeTeamId: HOME_ID,
    });

    expect(result.primary).toBeNull();
    expect(result.scoreIntegrity).toBe(true);
  });

  it("keeps a null minute without inventing one", () => {
    const result = deriveMatchEventHighlights({
      events: [
        event("away-penalty", 12, AWAY_ID, "penalty_goal"),
        event("home-try", null, HOME_ID, "try"),
      ],
      finalAwayScore: 3,
      finalHomeScore: 5,
      homeTeamId: HOME_ID,
    });

    expect(result.primary?.event.id).toBe("home-try");
    expect(result.primary?.event.minute).toBeNull();
  });

  it("hides the primary moment when reconstructed and final scores differ", () => {
    const result = deriveMatchEventHighlights({
      events: [event("home-try", 10, HOME_ID, "try")],
      finalAwayScore: 0,
      finalHomeScore: 12,
      homeTeamId: HOME_ID,
    });

    expect(result.primary).toBeNull();
    expect(result.scoreIntegrity).toBe(false);
  });
});
