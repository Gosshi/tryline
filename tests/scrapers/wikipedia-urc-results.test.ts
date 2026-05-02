import { describe, expect, it } from "vitest";

import { parseUrcResultsHtml } from "@/lib/scrapers/wikipedia-urc-results";

const HTML = `
<div class="mw-heading mw-heading2"><h2 id="Knockout_stage">Knockout stage</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Quarter-finals">Quarter-finals</h3></div>
<p>30 May 2025 Glasgow Warriors 36–18 Stormers Scotstoun Stadium, Glasgow Try: ignored Attendance: 6,867</p>
<p>31 May 2025 12:30 Bulls 42–33 Edinburgh Loftus Versfeld Stadium, Pretoria Try: ignored Attendance: 20,056</p>
<p>31 May 2025 15:00 Leinster 33–21 Scarlets Aviva Stadium, Dublin Try: ignored Attendance: 12,879</p>
<p>31 May 2025 17:30 Sharks 24–24 (a.e.t) ( 6-4 on pens.) Munster Kings Park Stadium, Durban Try: ignored Attendance: 22,247</p>
<div class="mw-heading mw-heading3"><h3 id="Semi-finals">Semi-finals</h3></div>
<p>7 June 2025 Leinster 37–19 Glasgow Warriors Aviva Stadium, Dublin Try: ignored Attendance: 15,762</p>
<p>7 June 2025 Bulls 25–13 Sharks Loftus Versfeld Stadium, Pretoria Try: ignored Attendance: 47,214</p>
<div class="mw-heading mw-heading2"><h2 id="URC_Grand_Final">URC Grand Final</h2></div>
<p>14 June 2025 Leinster 32–7 Bulls Croke Park, Dublin Try: ignored Attendance: 46,127</p>
`;

describe("parseUrcResultsHtml", () => {
  it("parses URC knockout and grand final sections", () => {
    const results = parseUrcResultsHtml(
      HTML,
      "2024-25",
      "https://example.test/2024-25_United_Rugby_Championship",
    );

    expect(results).toHaveLength(7);
    expect(results[0]).toMatchObject({
      away_score: 18,
      away_team_slug: "stormers",
      home_score: 36,
      home_team_slug: "glasgow-warriors",
      round: 1,
      season: "2024-25",
    });
    expect(results[0]?.kickoff_at).toBe("2025-05-30T00:00:00.000Z");
    expect(results[1]).toMatchObject({
      away_team_slug: "edinburgh",
      home_team_slug: "bulls",
    });
    expect(results[1]?.kickoff_at).toBe("2025-05-31T12:30:00.000Z");
    expect(results[3]).toMatchObject({
      away_team_slug: "munster",
      home_team_slug: "sharks",
    });
    expect(results[6]).toMatchObject({
      away_team_slug: "bulls",
      home_team_slug: "leinster",
      round: 3,
    });
  });
});
