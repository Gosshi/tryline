import { describe, expect, it } from "vitest";

import { containsUngroundedPlayerReference } from "@/lib/content/fabrication-guard";

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
