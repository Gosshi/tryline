import { describe, expect, it, vi } from "vitest";

import {
  applyCleanup,
  buildEventSignature,
  findContaminatedEventGroups,
  loadFinishedMatchesWithEvents,
  parseOptions,
  printGroups,
  runCleanup,
  type CleanupMatchRow,
  type CleanupPlanGroup,
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
    expect(parseOptions([])).toEqual({ keepPublished: false, ownerApproved: false });
    expect(parseOptions(["--dry-run"])).toEqual({ keepPublished: false, ownerApproved: false });
    expect(parseOptions(["--keep-published"])).toEqual({
      keepPublished: true,
      ownerApproved: false,
    });
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      keepPublished: false,
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
    const order: string[] = [];
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
            delete: () => {
              order.push("delete");
              return { in: matchEventsIn };
            },
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
            match("owner", contaminatedEvents, false),
            match("contaminated", contaminatedEvents, true),
          ],
          ownerIds: ["owner"],
          publishedRecapCount: 1,
          signature: "signature",
          source: "structural",
        },
      ],
      client as never,
      {
        backup: async (matches) => {
          order.push("backup");
          expect(matches.map((item) => item.id)).toEqual(["contaminated"]);
        },
        now: () => new Date("2026-01-01T00:00:00Z"),
      },
    );

    expect(order).toEqual(["backup", "delete"]);
    expect(matchEventsIn).toHaveBeenCalledWith("match_id", ["contaminated"]);
    expect(matchContentIn).toHaveBeenCalledWith("match_id", ["contaminated"]);
    expect(matchContentEqType).toHaveBeenCalledWith("content_type", "recap");
    expect(matchContentEqStatus).toHaveBeenCalledWith("status", "published");
    expect(summary).toEqual({
      deletedEvents: 2,
      demotedRecaps: 1,
      keptPublishedRecaps: 0,
      matchCount: 1,
    });
  });
  it("does not delete or update anything in dry-run mode", async () => {
    const from = vi.fn();
    const backup = vi.fn(async () => undefined);
    const result = await runCleanup(
      [{
        eventCount: 4,
        matches: [match("contaminated", contaminatedEvents)],
        ownerIds: [],
        publishedRecapCount: 0,
        signature: "signature",
        source: "structural",
      }],
      false,
      { from } as never,
      { backup },
    );

    expect(from).not.toHaveBeenCalled();
    expect(backup).not.toHaveBeenCalled();
    expect(result).toEqual({ demotedRecaps: 0, deletedEvents: 0, keptPublishedRecaps: 0, matchCount: 0 });
  });


  it("loads all finished matches from deterministic pages", async () => {
    const rows = Array.from({ length: 1500 }, (_, index) => ({
      id: `match-${String(index).padStart(4, "0")}`,
      match_events: [{ id: `event-${index}` }],
    }));
    const ranges: Array<[number, number]> = [];
    let query: Record<string, (...args: never[]) => unknown>;
    const client = {
      from: vi.fn(() => {
        query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          range: vi.fn((from: number, to: number) => {
            ranges.push([from, to]);
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          }),
        } as never;
        return query;
      }),
    };

    const loaded = await loadFinishedMatchesWithEvents(client as never);

    expect(loaded).toHaveLength(1500);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it("deletes events and preserves published recaps when requested", async () => {
    const matchEventsIn = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: "event-1" }], error: null }),
    });
    const matchContentUpdate = vi.fn();
    const client = {
      from: vi.fn((table: string) => table === "match_events"
        ? { delete: () => ({ in: matchEventsIn }) }
        : { update: matchContentUpdate }),
    };
    const summary = await applyCleanup(
      [{
        eventCount: 4,
        matches: [match("published", contaminatedEvents, true)],
        ownerIds: [],
        publishedRecapCount: 1,
        signature: "signature",
        source: "structural",
      }],
      client as never,
      { backup: async () => undefined, keepPublished: true },
    );

    expect(matchEventsIn).toHaveBeenCalledWith("match_id", ["published"]);
    expect(matchContentUpdate).not.toHaveBeenCalled();
    expect(summary).toEqual({
      deletedEvents: 1,
      demotedRecaps: 0,
      keptPublishedRecaps: 1,
      matchCount: 1,
    });
  });

  it("labels a structural group without a score-matching owner", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printGroups([{
      eventCount: 8,
      matches: [match("orphan", contaminatedEvents)],
      ownerIds: [],
      ownerMatches: [],
      publishedRecapCount: 0,
      signature: "signature",
      source: "structural",
    }]);

    expect(log.mock.calls.map(([line]) => line).join("\n")).toContain(
      "owners: 持ち主なし",
    );
    log.mockRestore();
  });

});
