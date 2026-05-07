import { describe, expect, it } from "vitest";

import { parseLeagueOneMatchPrintHtml } from "@/lib/scrapers/league-one-match";

const HTML = `
<section id="team">
  <div class="team home">
    <table>
      <tr><th class="title" colspan="3">MIE Honda HEAT</th></tr>
      <tr><th class="num">#</th><th class="name">Name（cm/kg/Age）</th><th class="pos">Pos.</th></tr>
      <tr><td class="num">1</td><td class="name">Tatsuhiko Tsurukawa （182/114/29）</td><td class="pos">PR</td></tr>
      <tr><td class="num">10</td><td class="name">Manu Vunipola （181/94/24）</td><td class="pos">SO</td></tr>
      <tr><td class="num">16</td><td class="name">Ikuma Yamada （177/100/25）</td><td class="pos">Re.</td></tr>
    </table>
  </div>
  <div class="team away">
    <table>
      <tr><th class="title" colspan="3">RICOH BlackRamsTokyo</th></tr>
      <tr><th class="num">#</th><th class="name">Name（cm/kg/Age）</th><th class="pos">Pos.</th></tr>
      <tr><td class="num">8</td><td class="name">Liam Gill （184/95/32）</td><td class="pos">NO8</td></tr>
      <tr><td class="num">10</td><td class="name">Ichigo Nakakusu （174/84/24）</td><td class="pos">SO</td></tr>
    </table>
  </div>
</section>
<section id="score">
  <div class="l1">
    <table>
      <tr><th>1st</th><th>Team</th><th>#.Name</th><th>Type</th><th>H</th><th></th><th>V</th></tr>
      <tr><td>18min</td><td>BR TOKYO</td><td>8.Liam Gill</td><td>T</td><td>0</td><td>-</td><td>5</td></tr>
      <tr><td>19min</td><td>BR TOKYO</td><td>10.Ichigo Nakakusu</td><td>G</td><td>0</td><td>-</td><td>7</td></tr>
      <tr><td>23min</td><td>MIE H</td><td>10.Manu Vunipola</td><td>PG</td><td>3</td><td>-</td><td>7</td></tr>
      <tr><td>34min</td><td>MIE H</td><td>10.Manu Vunipola</td><td>DGx</td><td>3</td><td>-</td><td>7</td></tr>
      <tr><th>2nd</th><th>Team</th><th>#.Name</th><th>Type</th><th>H</th><th></th><th>V</th></tr>
      <tr><td>7min</td><td>MIE H</td><td>11.Larry Sulunga</td><td>T</td><td>8</td><td>-</td><td>7</td></tr>
    </table>
  </div>
</section>
`;

describe("parseLeagueOneMatchPrintHtml", () => {
  it("parses lineups and scoring events from the print report", () => {
    const result = parseLeagueOneMatchPrintHtml(HTML);

    expect(result.players).toEqual([
      {
        jersey_number: 1,
        player_name: "Tatsuhiko Tsurukawa",
        team_side: "home",
      },
      { jersey_number: 10, player_name: "Manu Vunipola", team_side: "home" },
      { jersey_number: 16, player_name: "Ikuma Yamada", team_side: "home" },
      { jersey_number: 8, player_name: "Liam Gill", team_side: "away" },
      { jersey_number: 10, player_name: "Ichigo Nakakusu", team_side: "away" },
    ]);
    expect(result.events).toEqual([
      {
        event_type: "try",
        minute: 18,
        player_name: "Liam Gill",
        team_side: "away",
      },
      {
        event_type: "conversion",
        minute: 19,
        player_name: "Ichigo Nakakusu",
        team_side: "away",
      },
      {
        event_type: "penalty",
        minute: 23,
        player_name: "Manu Vunipola",
        team_side: "home",
      },
      {
        event_type: "try",
        minute: 47,
        player_name: "Larry Sulunga",
        team_side: "home",
      },
    ]);
  });

  it("parses Japanese player names and Japanese timeline labels", () => {
    const result = parseLeagueOneMatchPrintHtml(`
      <section id="team">
        <div class="team home">
          <table>
            <tr><th>#</th><th>Name</th><th>Pos.</th></tr>
            <tr><td class="num">1</td><td class="name">鶴川達彦（182/114/29）</td><td>PR</td></tr>
            <tr><td class="num">10</td><td class="name">マヌ・ヴニポラ（181/94/24）</td><td>SO</td></tr>
          </table>
        </div>
        <div class="team away">
          <table>
            <tr><th>#</th><th>Name</th><th>Pos.</th></tr>
            <tr><td class="num">8</td><td class="name">リアム・ギル（184/95/32）</td><td>NO8</td></tr>
          </table>
        </div>
      </section>
      <section id="score">
        <table>
          <tr><th>前半</th><th>チーム名</th><th>#.Name</th><th>種</th><th>H</th><th></th><th>V</th></tr>
          <tr><td>18分</td><td>ＢＲ東京</td><td>8.リアム・ギル</td><td>T</td><td>0</td><td>-</td><td>5</td></tr>
          <tr><th>後半</th><th>チーム名</th><th>#.Name</th><th>種</th><th>H</th><th></th><th>V</th></tr>
          <tr><td>7分</td><td>三重Ｈ</td><td>10.マヌ・ヴニポラ</td><td>PG</td><td>3</td><td>-</td><td>5</td></tr>
        </table>
      </section>
    `);

    expect(result.players).toEqual([
      { jersey_number: 1, player_name: "鶴川達彦", team_side: "home" },
      { jersey_number: 10, player_name: "マヌ・ヴニポラ", team_side: "home" },
      { jersey_number: 8, player_name: "リアム・ギル", team_side: "away" },
    ]);
    expect(result.events).toEqual([
      {
        event_type: "try",
        minute: 18,
        player_name: "リアム・ギル",
        team_side: "away",
      },
      {
        event_type: "penalty",
        minute: 47,
        player_name: "マヌ・ヴニポラ",
        team_side: "home",
      },
    ]);
  });
});
