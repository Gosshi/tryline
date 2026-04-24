import { describe, expect, it } from "vitest";

import { deriveContentState } from "@/lib/match-content/state";

import type { MatchStatus } from "@/lib/format/status";

const KICKOFF_AT = new Date("2027-02-06T15:00:00.000Z");

const BEFORE_PREVIEW_WINDOW = new Date("2027-02-04T14:59:59.000Z");
const AT_PREVIEW_WINDOW = new Date("2027-02-04T15:00:00.000Z");

const STATUSES: MatchStatus[] = [
  "scheduled",
  "in_progress",
  "finished",
  "postponed",
  "cancelled",
];

describe("deriveContentState", () => {
  it("returns expected states for preview across match statuses", () => {
    const expectedByStatus: Record<
      MatchStatus,
      { before: string; at: string }
    > = {
      cancelled: { at: "unavailable", before: "unavailable" },
      finished: { at: "preparing", before: "preparing" },
      in_progress: { at: "preparing", before: "preparing" },
      postponed: { at: "unavailable", before: "unavailable" },
      scheduled: { at: "preparing", before: "pre_window" },
    };

    for (const status of STATUSES) {
      expect(
        deriveContentState({
          contentType: "preview",
          kickoffAt: KICKOFF_AT,
          matchStatus: status,
          now: BEFORE_PREVIEW_WINDOW,
        }),
      ).toBe(expectedByStatus[status].before);

      expect(
        deriveContentState({
          contentType: "preview",
          kickoffAt: KICKOFF_AT,
          matchStatus: status,
          now: AT_PREVIEW_WINDOW,
        }),
      ).toBe(expectedByStatus[status].at);
    }
  });

  it("returns expected states for recap across match statuses", () => {
    const expectedByStatus: Record<MatchStatus, string> = {
      cancelled: "unavailable",
      finished: "preparing",
      in_progress: "pre_window",
      postponed: "unavailable",
      scheduled: "pre_window",
    };

    for (const status of STATUSES) {
      expect(
        deriveContentState({
          contentType: "recap",
          kickoffAt: KICKOFF_AT,
          matchStatus: status,
          now: BEFORE_PREVIEW_WINDOW,
        }),
      ).toBe(expectedByStatus[status]);

      expect(
        deriveContentState({
          contentType: "recap",
          kickoffAt: KICKOFF_AT,
          matchStatus: status,
          now: AT_PREVIEW_WINDOW,
        }),
      ).toBe(expectedByStatus[status]);
    }
  });
});
