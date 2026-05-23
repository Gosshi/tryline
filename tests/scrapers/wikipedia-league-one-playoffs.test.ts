import { describe, expect, it } from "vitest";

import { parseLeagueOnePlayoffMatchRefsHtml } from "@/lib/scrapers/wikipedia-league-one-playoffs";

const HTML = `
<div class="mw-heading"><h2 id="レギュラーシーズン">レギュラーシーズン</h2></div>
<div
  data-mw='{"parts":[{"template":{"target":{"wt":"rugbybox"},"params":{"score":{"wt":"12–10"},"report":{"wt":"[https://league-one.jp/match/11111/print Report]"}}}}]}'
></div>
<div class="mw-heading"><h2 id="プレーオフトーナメント">プレーオフトーナメント</h2></div>
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
<div class="mw-heading"><h2 id="入替戦">入替戦</h2></div>
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
    ]);
  });

  it("returns an empty array when the playoff section is absent", () => {
    expect(parseLeagueOnePlayoffMatchRefsHtml("<main></main>")).toEqual([]);
  });
});