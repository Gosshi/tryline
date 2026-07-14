import { describe, expect, it } from "vitest";

import {
  formatKickoffJst,
  formatKickoffJstCompact,
  formatKickoffJstDate,
  formatKickoffJstTime,
  formatKickoffLocal,
} from "@/lib/format/kickoff";

describe("kickoff formatter", () => {
  it("formats UTC into JST with a fixed +9 hour offset", () => {
    expect(formatKickoffJst("2027-02-05T20:15:00.000Z")).toBe(
      "2027-02-06 (土) 05:15 JST",
    );
  });

  it("formats JST date and time separately", () => {
    expect(formatKickoffJstDate("2027-02-05T20:15:00.000Z")).toBe(
      "2027-02-06 (土)",
    );
    expect(formatKickoffJstTime("2027-02-05T20:15:00.000Z")).toBe("05:15 JST");
  });

  it("formats compact JST kickoff labels for OG images", () => {
    expect(formatKickoffJstCompact("2026-07-18T08:40:00.000Z")).toBe(
      "7/18 (土) 17:40 JST",
    );
  });

  it("formats a local venue timezone with weekday and short timezone name", () => {
    expect(
      formatKickoffLocal("2027-02-05T20:15:00.000Z", "Europe/London"),
    ).toBe("2027-02-05 (Fri) 20:15 GMT");
  });
});
