import { describe, expect, it } from "vitest";

import {
  buildStructuralEventSignature,
  findStructuralContamination,
  type StructuralEventMatchRow,
} from "@/lib/data-integrity/contaminated-events";

const ownerScores = [
  ["try", true, "home"],
  ["try", false, "home"],
  ["try", false, "home"],
  ["try", false, "home"],
  ["conversion", false, "home"],
  ["conversion", false, "home"],
  ["conversion", false, "home"],
  ["penalty_goal", false, "home"],
  ["penalty_goal", false, "home"],
  ["try", true, "away"],
  ["try", false, "away"],
  ["try", false, "away"],
  ["try", false, "away"],
  ["conversion", false, "away"],
  ["conversion", false, "away"],
  ["penalty_goal", false, "away"],
  ["penalty_goal", false, "away"],
] as const;

function match(
  id: string,
  assignment: "owner" | "swapped" = "owner",
  score: { home: number | null; away: number | null } = { home: 34, away: 32 },
  eventRows: ReadonlyArray<readonly [string, boolean, "home" | "away"]> = ownerScores,
): StructuralEventMatchRow {
  return {
    away_score: score.away,
    away_team_id: `${id}-away`,
    away_team: { name: "Away" },
    home_score: score.home,
    home_team_id: `${id}-home`,
    home_team: { name: "Home" },
    id,
    kickoff_at: "2026-01-01T00:00:00.000Z",
    match_content: [],
    match_events: eventRows.map(([type, isPenaltyTry, side], index) => ({
      id: `${id}-event-${index}`,
      is_penalty_try: isPenaltyTry,
      minute: index + 1,
      player_id: assignment === "owner" ? `${id}-player-${index}` : null,
      team_id:
        side === "home"
          ? assignment === "owner" ? `${id}-home` : `${id}-away`
          : assignment === "owner" ? `${id}-away` : `${id}-home`,
      type,
    })),
  };
}

describe("structural event contamination", () => {
  it("groups by type and minute while identifying the score-matching owner", () => {
    const result = findStructuralContamination([
      match("owner"),
      match("copy-1", "swapped", { home: 38, away: 47 }),
      match("copy-2", "swapped", { home: 40, away: 50 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contaminated: ["copy-1", "copy-2"],
      eventCount: 17,
      owners: ["owner"],
    });
  });

  it("does not form groups from seven events or events with a null minute", () => {
    const seven = ownerScores.slice(0, 7);
    const nullMinute = match("null-minute");
    nullMinute.match_events[0]!.minute = null;
    const nullMinuteCopy = match(
      "null-minute-copy",
      "swapped",
      { home: 38, away: 47 },
    );
    nullMinuteCopy.match_events[0]!.minute = null;

    expect(findStructuralContamination([
      match("seven-1", "owner", { home: 34, away: 32 }, seven),
      match("seven-2", "swapped", { home: 38, away: 47 }, seven),
      nullMinute,
      nullMinuteCopy,
      match("valid"),
    ])).toEqual([]);
    expect(buildStructuralEventSignature(nullMinute.match_events)).toBeNull();
  });

  it("excludes matches with unknown scores and returns all mismatches when no owner exists", () => {
    const result = findStructuralContamination([
      match("unknown", "owner", { home: null, away: 32 }),
      match("wrong-1", "swapped", { home: 38, away: 47 }),
      match("wrong-2", "owner", { home: 40, away: 50 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contaminated: ["wrong-1", "wrong-2"],
      owners: [],
    });
  });
});
