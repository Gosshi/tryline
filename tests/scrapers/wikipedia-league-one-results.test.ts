import { describe, expect, it } from "vitest";

import { parseLeagueOneResultsHtml } from "@/lib/scrapers/wikipedia-league-one-results";

const HTML = `
<div class="mw-heading mw-heading2"><h2 id="Eliminatorias">Eliminatorias</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Cuartos_de_final">Cuartos de final</h3></div>
<p>17 de mayo de 2025 Blue Revs 20 - 35 Kobe Steelers Estadio Yamaha, Iwata Árbitro: ignored</p>
<p>18 de mayo de 2025 Sungoliath 28–24 Verblitz Estadio Chichibunomiya, Tokio Árbitro: ignored</p>
<div class="mw-heading mw-heading3"><h3 id="Semifinal">Semifinal</h3></div>
<p>24 de mayo de 2025 Spears 28 - 21 Kobe Steelers Estadio Chichibunomiya, Tokio Árbitro: ignored</p>
<p>25 de mayo de 2025 Brave Lupus 31–3 Sungoliath Estadio Chichibunomiya, Tokio Árbitro: ignored</p>
<div class="mw-heading mw-heading3"><h3 id="Tercer_puesto">Tercer puesto</h3></div>
<p>31 de mayo de 2025 Kobe Steelers 47–21 Sungoliath Estadio Chichibunomiya, Tokio Árbitro: ignored</p>
<div class="mw-heading mw-heading3"><h3 id="Final">Final</h3></div>
<p>1 de junio de 2025 Brave Lupus 18–13 Spears Estadio Nacional de Japón, Tokio Árbitro: ignored</p>
`;

describe("parseLeagueOneResultsHtml", () => {
  it("parses League One playoff and final sections", () => {
    const results = parseLeagueOneResultsHtml(
      HTML,
      "2024-25",
      "https://example.test/Japan_Rugby_League_One_2024-2025",
    );

    expect(results).toHaveLength(6);
    expect(results[0]).toMatchObject({
      away_score: 35,
      away_team_slug: "kobelco-kobe-steelers",
      home_score: 20,
      home_team_slug: "shizuoka-blue-revs",
      round: 1,
      season: "2024-25",
      venue: "Estadio Yamaha, Iwata",
    });
    expect(results[0]?.kickoff_at).toBe("2025-05-17T00:00:00.000Z");
    expect(results[2]).toMatchObject({
      away_team_slug: "kobelco-kobe-steelers",
      home_team_slug: "kubota-spears",
      round: 2,
    });
    expect(results[4]).toMatchObject({
      away_team_slug: "tokyo-suntory-sungoliath",
      home_team_slug: "kobelco-kobe-steelers",
      round: 3,
    });
    expect(results[5]).toMatchObject({
      away_team_slug: "kubota-spears",
      home_team_slug: "toshiba-brave-lupus",
      round: 4,
    });
    expect(results[5]?.kickoff_at).toBe("2025-06-01T00:00:00.000Z");
  });
});
