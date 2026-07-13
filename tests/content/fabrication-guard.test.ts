import { describe, expect, it } from "vitest";

import {
  containsContradictedZeroStatClaim,
  containsUngroundedPlayerReference,
  containsUnsupportedStatistic,
} from "@/lib/content/fabrication-guard";

const fabricatedPreview = `
# セクション2: キープレイヤーとマッチアップ

山澤拓也（フライハーフ）は地域獲得の起点になり、中野将伍（センター）はゲインラインで強みを見せる。
藤原信（スクラムハーフ）のテンポ管理も勝敗を左右する。
`;

describe("containsUngroundedPlayerReference", () => {
  it("detects key-player style player mentions when lineups and events are absent", () => {
    expect(
      containsUngroundedPlayerReference(fabricatedPreview, false, false),
    ).toBe(true);
  });

  it("does not trigger when lineups are present", () => {
    expect(
      containsUngroundedPlayerReference(fabricatedPreview, true, false),
    ).toBe(false);
  });

  it("does not trigger when events are present", () => {
    expect(
      containsUngroundedPlayerReference(fabricatedPreview, false, true),
    ).toBe(false);
  });

  it("does not block team-level tactical preview copy without player context", () => {
    expect(
      containsUngroundedPlayerReference(
        "日本はキックチェイスと接点の精度、イタリアはセットピースの圧力が焦点になる。",
        false,
        false,
      ),
    ).toBe(false);
  });
});

describe("containsUnsupportedStatistic", () => {
  it("detects kick attempt ratio phrasing without source support", () => {
    expect(containsUnsupportedStatistic("彼は7回中5回成功させた")).toBe(
      true,
    );
    expect(
      containsUnsupportedStatistic(
        "コルベはコンバージョンを12回中10回成功させた",
      ),
    ).toBe(true);
  });

  it("keeps existing unsupported statistic detections", () => {
    expect(containsUnsupportedStatistic("成功率は80%だった")).toBe(true);
    expect(containsUnsupportedStatistic("テリトリーで優位に立った")).toBe(
      true,
    );
    expect(containsUnsupportedStatistic("支配率の差が出た")).toBe(true);
  });

  it("detects ungrounded penalty discipline claims", () => {
    expect(
      containsUnsupportedStatistic(
        "アイルランドは反則なしのクリーンなプレーで勝利した",
      ),
    ).toBe(true);
    expect(
      containsUnsupportedStatistic(
        "アイルランドは反則を犯さないプレーで試合を支配した",
      ),
    ).toBe(true);
  });

  it("allows penalty discipline claims when penalty facts support them", () => {
    expect(
      containsUnsupportedStatistic("アイルランドは反則が少なかった", [
        "ホームチームのペナルティ5",
      ]),
    ).toBe(false);
  });

  it("does not treat penalty goal wording as an unsupported statistic", () => {
    expect(
      containsUnsupportedStatistic("アイルランドはペナルティゴールを決めた"),
    ).toBe(false);
  });
});

describe("containsContradictedZeroStatClaim", () => {
  it("detects penalty zero claims contradicted by team_stats", () => {
    expect(
      containsContradictedZeroStatClaim(
        "アイルランドは反則を犯さず、規律あるプレーで日本を封じ込めた",
        {
          away: { penalties_conceded: 9 },
          home: { penalties_conceded: 9 },
        },
      ),
    ).toBe(true);
  });

  it("detects non-penalty count stat zero claims", () => {
    expect(
      containsContradictedZeroStatClaim(
        "日本はターンオーバーなしで試合を進めた",
        {
          away: { turnovers: 3 },
          home: { turnovers: 5 },
        },
      ),
    ).toBe(true);
  });

  it("ignores non-zero penalty comparison claims", () => {
    expect(
      containsContradictedZeroStatClaim("日本は反則が多かった", {
        away: { penalties_conceded: 9 },
        home: { penalties_conceded: 9 },
      }),
    ).toBe(false);
  });

  it("does not flag zero claims when the stat is actually 0-0", () => {
    expect(
      containsContradictedZeroStatClaim("両チームとも反則なしで進めた", {
        away: { penalties_conceded: 0 },
        home: { penalties_conceded: 0 },
      }),
    ).toBe(false);
  });

  it("returns false when team_stats is unavailable", () => {
    expect(
      containsContradictedZeroStatClaim(
        "アイルランドは反則を犯さず試合を終えた",
        null,
      ),
    ).toBe(false);
  });
});
