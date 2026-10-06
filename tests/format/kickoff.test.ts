import { describe, expect, it } from "vitest";

import {
  formatKickoffJst,
  formatKickoffJstCompact,
  formatKickoffJstDate,
  formatKickoffJstTime,
  formatKickoffLocal,
} from "@/lib/format/kickoff";

describe("kickoff formatter", () => {
  it("shows only a date and 時刻未定 for an explicit TBD flag", () => {
    const kickoff = "2026-10-09T00:00:00.000Z";
    expect(formatKickoffJst(kickoff, true)).toBe("2026-10-09 (金) 時刻未定");
    expect(formatKickoffJstTime(kickoff, true)).toBe("時刻未定");
    expect(formatKickoffJstCompact(kickoff, true)).toBe("10/9 (金) 時刻未定");
    expect(formatKickoffLocal(kickoff, "Europe/London", true)).toBe("時刻未定");
  });

  it("keeps a genuine midnight UTC kickoff when the flag is false", () => {
    expect(formatKickoffJstTime("2026-10-09T00:00:00.000Z", false)).toBe(
      "09:00 JST",
    );
  });

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
