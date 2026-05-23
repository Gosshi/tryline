import { describe, expect, it } from "vitest";

import { parseLeagueOnePlayoffMatchRefsHtml } from "@/lib/scrapers/wikipedia-league-one-playoffs";

const HTML = `
<div class="mw-heading mw-heading2"><h2 id="レギュラーシーズン">レギュラーシーズン</h2></div>
<div
  data-mw='{"parts":[{"template":{"target":{"wt":"rugbybox"},"params":{"score":{"wt":"12–10"},"report":{"wt":"[https://league-one.jp/match/11111/print Report]"}}}}]}'
></div>
<div class="mw-heading mw-heading2"><h2 id="プレーオフトーナメント">プレーオフトーナメント</h2></div>
<table>
  <tr>
    <td
      data-mw='{"parts":[{"template":{"target":{"wt":"rugbybox"},"params":{"score":{"wt":"32–27"},"report":{"wt":"[https://league-one.jp/match/29291/print Report]"}}}}]}'
    ></td>
  </tr>
  <tr>
    <td
      data-mw='{"parts":[{"template":{"target":{"wt":"Rugbybox"},"params":{"score":{"wt":"v"},"report":{"wt":"https://league-one.jp/match/29292/print"}}}}]}'
    ></td>
  </tr>
</table>
<div class="mw-heading mw-heading3"><h3 id="準決勝">準決勝</h3></div>
<table>
  <tr>
    <td
      data-mw='{"parts":[{"template":{"target":{"wt":"rugbybox"},"params":{"score":{"wt":"41-22"},"report":{"wt":"[https://league-one.jp/match/29293/print Report]"}}}}]}'
    ></td>
  </tr>
</table>
<div class="mw-heading mw-heading2"><h2 id="入替戦">入替戦</h2></div>
<div
  data-mw='{"parts":[{"template":{"target":{"wt":"rugbybox"},"params":{"score":{"wt":"20-17"},"report":{"wt":"[https://league-one.jp/match/33333/print Report]"}}}}]}'
></div>
`;

describe("parseLeagueOnePlayoffMatchRefsHtml", () => {
  it("extracts league-one.jp print match ids from the playoff section only", () => {
    expect(parseLeagueOnePlayoffMatchRefsHtml(HTML)).toEqual([
      {
        awayScore: 27,
        homeScore: 32,
        leagueOneMatchId: 29291,
      },
      {
        awayScore: null,
        homeScore: null,
        leagueOneMatchId: 29292,
      },
      {
        awayScore: 22,
        homeScore: 41,
        leagueOneMatchId: 29293,
      },
    ]);
  });

  it("returns an empty array when the playoff section is absent", () => {
    expect(parseLeagueOnePlayoffMatchRefsHtml("<main></main>")).toEqual([]);
  });

  it("detects a playoff heading rendered as h4", () => {
    expect(
      parseLeagueOnePlayoffMatchRefsHtml(`
        <h4 id="プレーオフトーナメント">プレーオフトーナメント</h4>
        <table>
          <tr>
            <td
              data-mw='{"parts":[{"template":{"target":{"wt":"rugbybox"},"params":{"score":{"wt":"24-19"},"report":{"wt":"https://league-one.jp/match/40001/print"}}}}]}'
            ></td>
          </tr>
        </table>
      `),
    ).toEqual([
      {
        awayScore: 19,
        homeScore: 24,
        leagueOneMatchId: 40001,
      },
    ]);
  });
});