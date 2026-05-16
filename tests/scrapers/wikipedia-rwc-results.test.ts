import { describe, expect, it } from "vitest";

import { parseRwcHtml } from "@/lib/scrapers/wikipedia-rwc-results";

const SAMPLE_HTML = `
  <div class="mw-heading mw-heading3"><h3 id="Pool_A">Pool A</h3></div>
  <table>
    <tr><th></th><th></th><th></th><th></th><th></th></tr>
    <tr>
      <td>8 September 2023</td>
      <td><a>France</a></td>
      <td><a href="/wiki/2023_Rugby_World_Cup_Pool_A#France_vs_New_Zealand">27–13</a></td>
      <td><a>New Zealand</a></td>
      <td>Stade de France, Saint-Denis</td>
    </tr>
    <tr>
      <td>9 September 2023</td>
      <td><a>Italy</a></td>
      <td><a href="/wiki/2023_Rugby_World_Cup_Pool_A#Italy_vs_Namibia">52–8</a></td>
      <td><a>Namibia</a></td>
      <td>Stade Geoffroy Guichard, Saint-Étienne</td>
    </tr>
    <tr>
      <td>14 September 2023</td>
      <td><a>France</a></td>
      <td><a href="/wiki/2023_Rugby_World_Cup_Pool_A#France_vs_Uruguay">27–12</a></td>
      <td><a>Uruguay</a></td>
      <td>Stade Pierre-Mauroy, Villeneuve-d'Ascq</td>
    </tr>
  </table>

  <div class="mw-heading mw-heading3"><h3 id="Pool_B">Pool B</h3></div>
  <table>
    <tr><th></th><th></th><th></th><th></th><th></th></tr>
    <tr>
      <td>9 September 2023</td>
      <td><a>Ireland</a></td>
      <td><a href="/wiki/2023_Rugby_World_Cup_Pool_B#Ireland_vs_Romania">82–8</a></td>
      <td><a>Romania</a></td>
      <td>Nouveau Stade de Bordeaux, Bordeaux</td>
    </tr>
  </table>

  <div class="mw-heading mw-heading3"><h3 id="Pool_C">Pool C</h3></div>
  <table>
    <tr><th></th><th></th><th></th><th></th><th></th></tr>
    <tr>
      <td>9 September 2023</td>
      <td><a>Australia</a></td>
      <td><a href="/wiki/2023_Rugby_World_Cup_Pool_C#Australia_vs_Georgia">35–15</a></td>
      <td><a>Georgia</a></td>
      <td>Stade de France, Saint-Denis</td>
    </tr>
  </table>

  <div class="mw-heading mw-heading3"><h3 id="Pool_D">Pool D</h3></div>
  <table>
    <tr><th></th><th></th><th></th><th></th><th></th></tr>
    <tr>
      <td>10 September 2023</td>
      <td><a>Japan</a></td>
      <td><a href="/wiki/2023_Rugby_World_Cup_Pool_D#Japan_vs_Chile">42–12</a></td>
      <td><a>Chile</a></td>
      <td>Stadium de Toulouse, Toulouse</td>
    </tr>
  </table>

  <div class="mw-heading mw-heading3"><h3 id="Quarter-finals">Quarter-finals</h3></div>
  <div class="vevent summary">
    <table><tr><td>14 October 2023 17:00 CEST (UTC+2)</td></tr></table>
    <table>
      <tr>
        <td><a>Wales</a></td>
        <td><a href="/wiki/2023_Rugby_World_Cup_knockout_stage#Wales_vs_Argentina">17–29</a></td>
        <td><a>Argentina</a></td>
      </tr>
    </table>
    <span class="location">Stade de Marseille, Marseille</span>
  </div>
  <div class="mw-heading mw-heading3"><h3 id="Semi-finals">Semi-finals</h3></div>
  <div class="vevent summary">
    <table><tr><td>20 October 2023 21:00 CEST (UTC+2)</td></tr></table>
    <table>
      <tr>
        <td><a>Argentina</a></td>
        <td><a href="/wiki/2023_Rugby_World_Cup_knockout_stage#Argentina_vs_New_Zealand">6–44</a></td>
        <td><a>New Zealand</a></td>
      </tr>
    </table>
    <span class="location">Stade de France, Saint-Denis</span>
  </div>
  <div class="mw-heading mw-heading3"><h3 id="Bronze_final">Bronze final</h3></div>
  <div class="vevent summary">
    <table><tr><td>27 October 2023 21:00 CEST (UTC+2)</td></tr></table>
    <table>
      <tr>
        <td><a>Argentina</a></td>
        <td><a href="/wiki/2023_Rugby_World_Cup_knockout_stage#Argentina_vs_England">23–26</a></td>
        <td><a>England</a></td>
      </tr>
    </table>
    <span class="location">Stade de France, Saint-Denis</span>
  </div>
  <div class="mw-heading mw-heading3"><h3 id="Final">Final</h3></div>
  <div class="vevent summary">
    <table><tr><td>28 October 2023 21:00 CEST (UTC+2)</td></tr></table>
    <table>
      <tr>
        <td><a>New Zealand</a></td>
        <td><a href="/wiki/2023_Rugby_World_Cup_knockout_stage#New_Zealand_vs_South_Africa">11–12</a></td>
        <td><a>South Africa</a></td>
      </tr>
    </table>
    <span class="location">Stade de France, Saint-Denis</span>
  </div>
`;

describe("parseRwcHtml", () => {
  it("parses pool matches with pool name, round, and phase", () => {
    const matches = parseRwcHtml(
      SAMPLE_HTML,
      "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup",
    );
    const franceMatch = matches.find(
      (match) => match.event_id === "France_vs_New_Zealand",
    );
    const uruguayMatch = matches.find(
      (match) => match.event_id === "France_vs_Uruguay",
    );

    expect(franceMatch).toMatchObject({
      away_team_name: "New Zealand",
      home_team_name: "France",
      phase: "pool",
      pool_name: "Pool A",
      round: 1,
      source_url: "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_A",
      status: "finished",
    });
    expect(uruguayMatch?.round).toBe(2);
  });

  it("parses knockout matches with phase and round", () => {
    const matches = parseRwcHtml(
      SAMPLE_HTML,
      "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup",
    );

    expect(
      matches.find((match) => match.event_id === "Wales_vs_Argentina"),
    ).toMatchObject({
      phase: "quarter-final",
      round: 5,
    });
    expect(
      matches.find((match) => match.event_id === "Argentina_vs_New_Zealand"),
    ).toMatchObject({
      phase: "semi-final",
      round: 6,
    });
    expect(
      matches.find((match) => match.event_id === "Argentina_vs_England"),
    ).toMatchObject({
      phase: "bronze-final",
      round: 7,
    });
    expect(
      matches.find((match) => match.event_id === "New_Zealand_vs_South_Africa"),
    ).toMatchObject({
      phase: "final",
      round: 8,
    });
  });

  it("throws for unknown team names", () => {
    expect(() =>
      parseRwcHtml(
        SAMPLE_HTML.replace(">Chile<", ">Atlantis<"),
        "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup",
      ),
    ).toThrow("Unknown RWC 2023 team name: Atlantis");
  });
});
