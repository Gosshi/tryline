import { describe, expect, it } from "vitest";

import { formatKickoffJst, formatKickoffLocal } from "@/lib/format/kickoff";

describe("kickoff formatter", () => {
  it("formats UTC into JST with a fixed +9 hour offset", () => {
    expect(formatKickoffJst("2027-02-05T20:15:00.000Z")).toBe("2027-02-06 (土) 05:15 JST");
  });

  it("formats a local venue timezone with weekday and short timezone name", () => {
    expect(formatKickoffLocal("2027-02-05T20:15:00.000Z", "Europe/London")).toBe(
      "2027-02-05 (Fri) 20:15 GMT",
    );
  });
});
