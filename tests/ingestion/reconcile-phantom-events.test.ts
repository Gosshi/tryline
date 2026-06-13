import { describe, expect, it } from "vitest";

import { reconcilePhantomNullMinuteScoringEvents } from "@/lib/ingestion/reconcile-phantom-events";

type TestEvent = {
  id: string;
  isPenaltyTry?: boolean;
  minute: number | null;
  type: string;
};

describe("reconcilePhantomNullMinuteScoringEvents", () => {
  it("reconciles a single null-minute conversion overcount", () => {
    const events: TestEvent[] = [
      { id: "try-1", minute: 10, type: "try" },
      { id: "con-1", minute: 11, type: "conversion" },
      { id: "try-2", minute: 60, type: "try" },
      { id: "ghost-con", minute: null, type: "conversion" },
    ];

    const result = reconcilePhantomNullMinuteScoringEvents(events, 12);

    expect(result).toMatchObject({
      actual: 12,
      afterImplied: 12,
      implied: 14,
      status: "reconciled",
    });
    expect(result.remove.map((event) => event.id)).toEqual(["ghost-con"]);
  });

  it("requires a unique removal subset before reconciling", () => {
    const events: TestEvent[] = [
      { id: "try-1", minute: 10, type: "try" },
      { id: "con-1", minute: 11, type: "conversion" },
      { id: "ghost-con-a", minute: null, type: "conversion" },
      { id: "ghost-con-b", minute: null, type: "conversion" },
    ];

    const result = reconcilePhantomNullMinuteScoringEvents(events, 9);

    expect(result).toMatchObject({
      afterImplied: 11,
      implied: 11,
      remove: [],
      status: "needs_review",
    });
  });

  it("does nothing for undercounted event totals", () => {
    const result = reconcilePhantomNullMinuteScoringEvents(
      [{ id: "try-1", minute: 10, type: "try" }],
      12,
    );

    expect(result).toMatchObject({
      afterImplied: 5,
      implied: 5,
      remove: [],
      status: "ok",
    });
  });

  it("keeps penalty tries while removing a separate null-minute ghost", () => {
    const events: TestEvent[] = [
      { id: "penalty-try", isPenaltyTry: true, minute: 10, type: "try" },
      { id: "ghost-con", minute: null, type: "conversion" },
    ];

    const result = reconcilePhantomNullMinuteScoringEvents(events, 7);

    expect(result.status).toBe("reconciled");
    expect(result.remove.map((event) => event.id)).toEqual(["ghost-con"]);
    expect(result.remove.map((event) => event.id)).not.toContain("penalty-try");
  });

  it("does not remove null-minute scoring events when they cannot reconcile exactly", () => {
    const events: TestEvent[] = [
      { id: "try-1", minute: 10, type: "try" },
      { id: "ghost-con", minute: null, type: "conversion" },
    ];

    const result = reconcilePhantomNullMinuteScoringEvents(events, 4);

    expect(result).toMatchObject({
      afterImplied: 7,
      implied: 7,
      remove: [],
      status: "needs_review",
    });
  });
});
