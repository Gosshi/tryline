import { describe, expect, it } from "vitest";

import { parseLeagueOneScheduleHtml } from "@/lib/scrapers/league-one-schedule";

const HTML = `
<div class="c-schedule">
  <div class="ttl-wrap">
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2024-25 PLAY-OFFS<br> quarterfinals (D1-M109)</h3>
    <p class="place"><a>Hanazono Rugby Stadium (Osaka)</a></p>
  </div>
  <div class="con">
    <div class="datetime"><p class="date">17.05 <span>Sat</span></p><p class="time">12:05</p></div>
    <ul class="game">
      <li class="home"><a><p class="name only-pc">SHIZUOKA BlueRevs</p></a><p class="score">20</p></li>
      <li class="away"><a><p class="name only-pc">KOBELCO KOBE STEELERS</p></a><p class="score">35</p></li>
    </ul>
  </div>
  <div class="info"><a href="/en/match/28125" class="btn-match-detail">Match Info (Full-Time)</a></div>
</div>
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
    <h3 class="ttl">NTT JAPAN RUGBY LEAGUE ONE 2024-25 DIVISION2<br> R1 (D2-M1)</h3>
  </div>
  <div class="info"><a href="/en/match/99999" class="btn-match-detail">Match Info (Full-Time)</a></div>
</div>
`;

describe("parseLeagueOneScheduleHtml", () => {
  it("parses finished regular-season Division 1 matches", () => {
    const entries = parseLeagueOneScheduleHtml(HTML, "2024-25");

    expect(entries).toEqual([
      {
        away_score: 21,
        away_team_slug: "ricoh-black-rams",
        home_score: 23,
        home_team_slug: "honda-heat",
        kickoff_at: "2024-12-21T03:10:00.000Z",
        league_one_match_id: 27447,
        match_url: "https://league-one.jp/en/match/27447",
        round: 1,
        venue: "Suzuka Sports Garden Rugby Ground (Mie)",
      },
    ]);
  });
});
