import { describe, expect, it } from "vitest";

import { parseTop14ResultsHtml } from "@/lib/scrapers/wikipedia-top-14-results";

const HTML = `
<div class="mw-heading mw-heading2"><h2 id="Relegation_play-off">Relegation play-off</h2></div>
<p>14 June 2025 18:00 Grenoble11–13Perpignan Try: ignored Stade des Alpes Attendance: 19,695 Referee: Thomas Charabas</p>
<div class="mw-heading mw-heading2"><h2 id="Playoffs">Playoffs</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Semi-final_Qualifiers">Semi-final Qualifiers</h3></div>
<p>13 June 2025 21:05 Bayonne (4)20–3(5) Clermont Try: ignored Stade Jean-Dauger Attendance: 13,507 Referee: Tual Trainini</p>
<p>14 June 2025 21:05 Toulon (3)52–23(6) Castres Try: ignored Stade Mayol Attendance: 15,364 Referee: Benoit Rousselet</p>
<div class="mw-heading mw-heading3"><h3 id="Semi-finals">Semi-finals</h3></div>
<p>20 June 2025 21:05 Toulouse (1)32–25(4) Bayonne Try: ignored Parc Olympique Lyonnais, Décines-Charpieu Attendance: 58,741 Referee: Luc Ramos</p>
<p>21 June 2025 21:05 Bordeaux Bègles (2)39–24(3) Toulon Try: ignored Parc Olympique Lyonnais, Décines-Charpieu Attendance: 58,408 Referee: Ludovic Cayre</p>
<div class="mw-heading mw-heading3"><h3 id="Final">Final</h3></div>
<p>28 June 2025 21:05 Toulouse (1)39–33 (a.e.t.)(2) Bordeaux Bègles Try: ignored Stade de France, Saint-Denis Attendance: 78,000 Referee: Pierre Brousset</p>
`;

describe("parseTop14ResultsHtml", () => {
  it("parses Top 14 relegation and playoff sections", () => {
    const results = parseTop14ResultsHtml(
      HTML,
      "2024-25",
      "https://example.test/2024-25_Top_14_season",
    );

    expect(results).toHaveLength(6);
    expect(results[0]).toMatchObject({
      away_score: 13,
      away_team_slug: "perpignan",
      home_score: 11,
      home_team_slug: "grenoble",
      round: 0,
      season: "2024-25",
    });
    expect(results[0]?.kickoff_at).toBe("2025-06-14T16:00:00.000Z");
    expect(results[3]).toMatchObject({
      away_team_slug: "bayonne",
      home_team_slug: "toulouse",
      round: 2,
    });
    expect(results[5]).toMatchObject({
      away_team_slug: "bordeaux-begles",
      home_team_slug: "toulouse",
      round: 3,
    });
    expect(results[5]?.kickoff_at).toBe("2025-06-28T19:05:00.000Z");
  });
});
