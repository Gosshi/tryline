import { describe, expect, it, vi } from "vitest";

import { parseTop14MatchStatsHtml } from "@/lib/scrapers/top14-match-stats";

const HTML = `
  <section>
    <div data-stat="possession_pct" data-home="58%" data-away="42%"></div>
    <div class="stat-row" data-stat="territoire">
      <span class="home">61%</span>
      <span class="label">Territoire</span>
      <span class="away">39%</span>
    </div>
    <table>
      <tbody>
        <tr><td>11</td><th>Touches gagnées</th><td>10</td></tr>
        <tr><td>13</td><th>Touches total</th><td>12</td></tr>
        <tr><td>7</td><th>Mêlées gagnées</th><td>4</td></tr>
        <tr><td>9</td><th>Mêlées total</th><td>6</td></tr>
        <tr><td>142</td><th>Plaquages réussis</th><td>128</td></tr>
        <tr><td>19</td><th>Plaquages manqués</th><td>22</td></tr>
        <tr><td>91</td><th>Ballons joués</th><td>77</td></tr>
        <tr><td>8</td><th>Pénalités concédées</th><td>12</td></tr>
        <tr><td>1</td><th>Cartons jaunes</th><td>0</td></tr>
        <tr><td>0</td><th>Cartons rouges</th><td>0</td></tr>
        <tr><td>6</td><th>En-avants</th><td>9</td></tr>
      </tbody>
    </table>
  </section>
`;

describe("parseTop14MatchStatsHtml", () => {
  it("extracts official team stats from Top 14-like HTML", () => {
    const result = parseTop14MatchStatsHtml(HTML, "https://example.com/stats");

    expect(result).toEqual({
      sourceUrl: "https://example.com/stats",
      home: {
        carries: 91,
        errors: 6,
        lineouts_total: 13,
        lineouts_won: 11,
        penalties_conceded: 8,
        possession_pct: 58,
        red_cards: 0,
        scrums_total: 9,
        scrums_won: 7,
        tackles_made: 142,
        tackles_missed: 19,
        territory_pct: 61,
        yellow_cards: 1,
      },
      away: {
        carries: 77,
        errors: 9,
        lineouts_total: 12,
        lineouts_won: 10,
        penalties_conceded: 12,
        possession_pct: 42,
        red_cards: 0,
        scrums_total: 6,
        scrums_won: 4,
        tackles_made: 128,
        tackles_missed: 22,
        territory_pct: 39,
        yellow_cards: 0,
      },
    });
  });

  it("omits invalid percentages and count fields while keeping valid stats", () => {
    const warn = vi.fn();
    const result = parseTop14MatchStatsHtml(
      `
        <div data-stat="possession_pct" data-home="101%" data-away="-1%"></div>
        <div data-stat="carries" data-home="90.5" data-away="80"></div>
        <div data-stat="penalties_conceded" data-home="8" data-away="7"></div>
      `,
      "https://example.com/stats",
      { warn },
    );

    expect(result).toEqual({
      sourceUrl: "https://example.com/stats",
      home: { penalties_conceded: 8 },
      away: { carries: 80, penalties_conceded: 7 },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid Top 14 percentage"),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid Top 14 count"),
    );
  });

  it("returns null when no supported stat rows exist", () => {
    expect(
      parseTop14MatchStatsHtml("<p>No stats</p>", "https://example.com"),
    ).toBeNull();
  });
});
