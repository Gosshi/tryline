import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildJrfuBraveBlossomsMatchUrl,
  findJrfuMatchUrl,
  parseJrfuMatchLineupHtml,
} from "@/lib/scrapers/jrfu-lineups";

const sourceUrl = "https://www.rugby-japan.jp/match/30035";
const html = readFileSync(
  path.join(process.cwd(), "tests/fixtures/jrfu-match-30035-lineups.html"),
  "utf8",
);

describe("JRFU match lineup parser", () => {
  it("parses both teams' starters and reserves from the official match page", () => {
    const lineup = parseJrfuMatchLineupHtml(html, sourceUrl);

    expect(lineup).toMatchObject({
      opponent_name: "オーストラリア代表",
      source_url: sourceUrl,
    });
    expect(lineup?.japan_players).toHaveLength(23);
    expect(lineup?.opponent_players).toHaveLength(23);
    expect(lineup?.japan_players).toEqual(
      expect.arrayContaining([
        { is_starter: true, jersey_number: 1, name: "岡部崇人" },
        { is_starter: false, jersey_number: 17, name: "大塚壮二郎" },
      ]),
    );
    expect(lineup?.opponent_players).toEqual(
      expect.arrayContaining([
        { is_starter: true, jersey_number: 1, name: "アンガス・ベル" },
        {
          is_starter: false,
          jersey_number: 23,
          name: "フィリポ・ダウグヌ",
        },
      ]),
    );
    expect(lineup?.japan_players.map((player) => player.jersey_number)).toEqual(
      Array.from({ length: 23 }, (_, index) => index + 1),
    );
    expect(
      lineup?.japan_players.filter((player) => player.is_starter),
    ).toHaveLength(15);
    expect(
      lineup?.opponent_players.filter((player) => !player.is_starter),
    ).toHaveLength(8);
  });

  it("resolves the official member page through the JST Brave Blossoms schedule URL", () => {
    expect(buildJrfuBraveBlossomsMatchUrl("2026-08-15T06:15:00.000Z")).toBe(
      "https://www.rugby-japan.jp/braveblossoms/match/20260815",
    );
    expect(
      findJrfuMatchUrl(
        '<a href="https://www.rugby-japan.jp/match/30035">試合登録メンバー/試合記録はこちら</a>',
      ),
    ).toBe(sourceUrl);
  });

  it("returns null when the match members are not announced", () => {
    expect(
      parseJrfuMatchLineupHtml("<main><h1>試合情報</h1></main>", sourceUrl),
    ).toBeNull();
  });
});
