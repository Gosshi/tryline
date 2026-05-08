import { describe, expect, it } from "vitest";

import { parseLeagueOneLiveHtml } from "@/lib/ingestion/sources/league-one-live";
import { parsePncLiveHtml } from "@/lib/ingestion/sources/wikipedia-pnc";
import { parsePremiershipLiveHtml } from "@/lib/ingestion/sources/wikipedia-premiership";

const PREMIERSHIP_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Regular_season">Regular season</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Round_1">Round 1</h3></div>
<div class="vevent summary" id="Bath_v_Bristol_Bears">
  <table><tbody><tr><td>20 September 2025<br />19:45</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Bath</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>Bristol Bears</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">The Recreation Ground</span></td></tr></tbody></table>
</div>
<div class="vevent summary" id="Saracens_v_Sale_Sharks">
  <table><tbody><tr><td>21 September 2025<br />15:00</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Saracens</a></span></td>
    <td>28–17</td>
    <td class="vcard"><span class="fn org"><a>Sale Sharks</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">StoneX Stadium</span></td></tr></tbody></table>
</div>
`;

const PNC_HTML = `
<div class="mw-heading mw-heading2"><h2 id="Pool_A">Pool A</h2></div>
<div class="vevent summary" id="Japan_v_Fiji">
  <table><tbody><tr><td>1 September 2026<br />19:00 JST</td></tr></tbody></table>
  <table><tbody><tr>
    <td class="vcard"><span class="fn org"><a>Japan</a></span></td>
    <td>v</td>
    <td class="vcard"><span class="fn org"><a>Fiji</a></span></td>
  </tr></tbody></table>
  <table><tbody><tr><td><span class="location">Tokyo</span></td></tr></tbody></table>
</div>
`;

const LEAGUE_ONE_HTML = `
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2024-25 DIVISION1<br> R1 conference B (D1-M1)</h3>
    <p class="place"><a>Suzuka Sports Garden Rugby Ground (Mie)</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">21.12 <span>Sat</span></p><p class="time">12:10</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">MIE Honda HEAT</p></a><p class="score">23</p></li>
      <li class="away"><a><p class="name only-pc">BlackRams Tokyo</p></a><p class="score">21</p></li>
    </ul>
  </div>
  <div class="info"><a href="/en/match/27447" class="btn-match-detail">Match Info (Full-Time)</a></div>
</div>
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2024-25 DIVISION1<br> R2 conference B (D1-M2)</h3>
    <p class="place"><a>Kumagaya Rugby Stadium</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">28.12 <span>Sat</span></p><p class="time">14:30</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">Saitama Wild Knights</p></a><p class="score"></p></li>
      <li class="away"><a><p class="name only-pc">SHIZUOKA BlueRevs</p></a><p class="score"></p></li>
    </ul>
  </div>
  <div class="info"><a class="btn-match-detail">Match Info</a></div>
</div>
`;

describe("live competition source adapters", () => {
  it("keeps Premiership scheduled vevents instead of dropping scoreless matches", () => {
    const matches = parsePremiershipLiveHtml(PREMIERSHIP_HTML);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      awayScore: null,
      awayTeamSlug: "bristol-bears",
      homeScore: null,
      homeTeamSlug: "bath",
      status: "scheduled",
    });
    expect(matches[1]).toMatchObject({
      awayScore: 17,
      homeScore: 28,
      status: "finished",
    });
  });

  it("returns Nations Cup scheduled matches without filtering to finished only", () => {
    const matches = parsePncLiveHtml(PNC_HTML);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      awayTeamSlug: "fiji",
      homeTeamSlug: "japan",
      round: 1,
      status: "scheduled",
    });
  });

  it("keeps League One scheduled cards without Full-Time or scores", () => {
    const matches = parseLeagueOneLiveHtml(LEAGUE_ONE_HTML, "2024-25");

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      awayScore: 21,
      awayTeamSlug: "ricoh-black-rams",
      homeScore: 23,
      homeTeamSlug: "honda-heat",
      status: "finished",
    });
    expect(matches[1]).toMatchObject({
      awayScore: null,
      awayTeamSlug: "shizuoka-blue-revs",
      eventId: "2_saitama_wild_knights_v_shizuoka_bluerevs",
      homeScore: null,
      homeTeamSlug: "saitama-wild-knights",
      status: "scheduled",
    });
  });
});
