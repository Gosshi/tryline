import { describe, expect, it } from "vitest";

import { parseWikipediaRwc2027Html } from "@/lib/ingestion/sources/wikipedia-rwc";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import schedule from "@/tests/fixtures/rwc2027-kickoffs.json";

function fixtureHtml(
  dateText: string,
  timeText: string,
  timezone: string,
  venue: string,
) {
  return `<div class="vevent summary" id="France_v_Japan">
    <table><tr><td>${dateText}<br>${timeText} ${timezone}</td></tr></table>
    <table><tr><td><a>France</a></td><td>v</td><td><a>Japan</a></td></tr></table>
    <span class="location">${venue}</span>
  </div>`;
}

function parseScheduledMatch(row: (typeof schedule)[number]) {
  // Deliberately use a misleading abbreviation: the venue must be authoritative.
  return parseWikipediaRwc2027Html(
    fixtureHtml(row.dateText, row.timeText, "AEDT", `Stadium, ${row.city}`),
  )[0]?.kickoffAt;
}

describe("RWC 2027 venue kickoffs", () => {
  it.each(schedule)(
    "#$number $match in $city: $dateText $timeText → $expectedUtc",
    (row) => {
      expect(parseScheduledMatch(row)).toBe(row.expectedUtc);
    },
  );

  it.each([
    [4, "Melbourne on October 2 before daylight saving"],
    [2, "Adelaide on October 2 at UTC+09:30"],
    [6, "Adelaide on October 3 at UTC+10:30"],
    [25, "Japan v USA in Adelaide"],
    [15, "France v Japan in Brisbane"],
    [1, "Australia v Hong Kong China in Perth"],
  ])("converts #%i %s", (number) => {
    const row = schedule.find((match) => match.number === number)!;
    expect(parseScheduledMatch(row)).toBe(row.expectedUtc);
  });

  it.each(["AEST", "AEDT", "XYZT"])(
    "uses Brisbane's zone despite %s in Wikipedia",
    (timezone) => {
      const html = fixtureHtml(
        "9 October 2027",
        "18:45",
        timezone,
        "Brisbane Stadium, Brisbane",
      );
      expect(parseWikipediaRwc2027Html(html)[0]?.kickoffAt).toBe(
        "2027-10-09T08:45:00.000Z",
      );
    },
  );

  it.each(["Stadium Australia, Sydney", "Sydney Football Stadium, Sydney"])(
    "recognizes %s",
    (venue) => {
      expect(
        parseWikipediaRwc2027Html(
          fixtureHtml("17 October 2027", "19:45", "AEST", venue),
        )[0]?.kickoffAt,
      ).toBe("2027-10-17T08:45:00.000Z");
    },
  );

  it("leaves an unknown venue's kickoff unset", () => {
    expect(
      parseWikipediaRwc2027Html(
        fixtureHtml("9 October 2027", "18:45", "AEST", "Unknown Stadium"),
      )[0]?.kickoffAt,
    ).toBeNull();
  });
});

describe("shared Wikipedia timezone abbreviations", () => {
  it.each([
    ["XYZT", null],
    ["AEDTX", null],
    ["ACST", "2027-10-15T10:30:00.000Z"],
    ["ACDT", "2027-10-15T09:30:00.000Z"],
    ["AWST", "2027-10-15T12:00:00.000Z"],
  ])("converts %s safely", (timezone, expected) => {
    expect(
      parseWikipediaSixNationsHtml(
        fixtureHtml(
          "15 October 2027",
          "20:00",
          timezone!,
          "Adelaide Oval, Adelaide",
        ),
      )[0]?.kickoffAt,
    ).toBe(expected);
  });

  it("preserves date-only fixtures as midnight UTC", () => {
    const html = fixtureHtml("15 October 2027", "", "", "Stadium");
    expect(parseWikipediaSixNationsHtml(html)[0]?.kickoffAt).toBe(
      "2027-10-15T00:00:00.000Z",
    );
  });
});
