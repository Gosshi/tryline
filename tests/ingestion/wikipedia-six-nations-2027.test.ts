import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseWikipediaSixNations2027Html } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";

describe("parseWikipediaSixNations2027Html", () => {
  it("parses Round 1 vevent blocks into structured fixtures", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/wikipedia-six-nations-2027.html",
    );
    const html = readFileSync(fixturePath, "utf8");
    const matches = parseWikipediaSixNations2027Html(html);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      awayScore: null,
      awayTeamName: "England",
      eventId: "Ireland_v_England",
      homeScore: null,
      homeTeamName: "Ireland",
      round: 1,
      status: "scheduled",
      venue: "Aviva Stadium, Dublin",
    });
    expect(matches[0]?.kickoffAt).toBe("2027-02-05T20:10:00.000Z");
    expect(matches[0]?.lineupTableHtml).toBeNull();
    expect(matches[1]).toMatchObject({
      awayScore: 13,
      awayTeamName: "Wales",
      eventId: "France_v_Wales",
      homeScore: 27,
      homeTeamName: "France",
      round: 1,
      status: "finished",
      venue: "Stade de France, Saint-Denis",
    });
    expect(matches[1]?.kickoffAt).toBe("2027-02-06T16:40:00.000Z");
    expect(matches[1]?.lineupTableHtml).toContain("France Fullback");
  });
});
