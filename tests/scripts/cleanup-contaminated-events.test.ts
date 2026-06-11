import { describe, expect, it, vi } from "vitest";

import {
  applyCleanup,
  buildEventSignature,
  findContaminatedEventGroups,
  parseOptions,
  type CleanupMatchRow,
} from "@/scripts/cleanup-contaminated-events";

function match(
  id: string,
  events: CleanupMatchRow["match_events"],
  published = false,
): CleanupMatchRow {
  return {
    away_team: { name: `Away ${id}` },
    home_team: { name: `Home ${id}` },
    id,
    kickoff_at: "2026-01-01T00:00:00.000Z",
    match_content: published
      ? [{ content_type: "recap", status: "published" }]
      : [],
    match_events: events,
  };
}

const contaminatedEvents = [
  { id: "e1", minute: 10, player_id: "p1", type: "try" },
  { id: "e2", minute: 11, player_id: "p2", type: "conversion" },
  { id: "e3", minute: 20, player_id: "p3", type: "try" },
  { id: "e4", minute: null, player_id: null, type: "penalty_goal" },
];

describe("cleanup-contaminated-events", () => {
  it("parses dry-run and owner approval options", () => {
    expect(parseOptions([])).toEqual({ ownerApproved: false });
    expect(parseOptions(["--dry-run"])).toEqual({ ownerApproved: false });
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      ownerApproved: true,
    });
  });

  it("builds stable signatures independent of event order", () => {
    expect(buildEventSignature(contaminatedEvents)).toBe(
      buildEventSignature([...contaminatedEvents].reverse()),
    );
  });

  it("detects duplicated event signatures and ignores groups with three events or fewer", () => {
    const smallEvents = contaminatedEvents.slice(0, 3);
    const groups = findContaminatedEventGroups([
      match("match-1", contaminatedEvents, true),
      match("match-2", [...contaminatedEvents].reverse(), false),
      match("match-3", smallEvents, true),
      match("match-4", [...smallEvents].reverse(), true),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      eventCount: 4,
      publishedRecapCount: 1,
    });
    expect(groups[0]?.matches.map((item) => item.id)).toEqual([
      "match-1",
      "match-2",
    ]);
  });

  it("deletes contaminated events and demotes published recaps when approved", async () => {
    const matchEventsSelect = vi.fn().mockResolvedValue({
      data: [{ id: "event-1" }, { id: "event-2" }],
      error: null,
    });
    const matchEventsIn = vi.fn(() => ({ select: matchEventsSelect }));
    const matchContentSelect = vi.fn().mockResolvedValue({
      data: [{ id: "content-1" }],
      error: null,
    });
    const matchContentEqStatus = vi.fn(() => ({ select: matchContentSelect }));
    const matchContentEqType = vi.fn(() => ({ eq: matchContentEqStatus }));
    const matchContentIn = vi.fn(() => ({ eq: matchContentEqType }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "match_events") {
          return {
            delete: () => ({ in: matchEventsIn }),
          };
        }

        return {
          update: () => ({ in: matchContentIn }),
        };
      }),
    };

    const summary = await applyCleanup(
      [
        {
          eventCount: 4,
          matches: [
            match("match-1", contaminatedEvents, true),
            match("match-2", contaminatedEvents, false),
          ],
          publishedRecapCount: 1,
          signature: "signature",
        },
      ],
      client as never,
    );

    expect(matchEventsIn).toHaveBeenCalledWith("match_id", [
      "match-1",
      "match-2",
    ]);
    expect(matchContentIn).toHaveBeenCalledWith("match_id", [
      "match-1",
      "match-2",
    ]);
    expect(matchContentEqType).toHaveBeenCalledWith("content_type", "recap");
    expect(matchContentEqStatus).toHaveBeenCalledWith("status", "published");
    expect(summary).toEqual({
      deletedEvents: 2,
      demotedRecaps: 1,
      matchCount: 2,
    });
  });
});
