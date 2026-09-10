import { describe, expect, it } from "vitest";

import { formatPlayerNameDisplay } from "@/lib/format/player-name-display";

describe("formatPlayerNameDisplay", () => {
  it("compacts kanji and hiragana player names into one display convention", () => {
    expect(formatPlayerNameDisplay("齋藤 直人")).toBe("齋藤直人");
    expect(formatPlayerNameDisplay("木田晴斗")).toBe("木田晴斗");
    expect(formatPlayerNameDisplay("やまだ たろう")).toBe("やまだたろう");
  });

  it.each(["Seungsin Lee", "リーチ マイケル", "佐藤 Taro", null, ""])(
    "keeps non-target player names unchanged: %s",
    (name) => {
      expect(formatPlayerNameDisplay(name)).toBe(name);
    },
  );
});
