import { describe, expect, it } from "vitest";

import { buildOfficialReplyText } from "@/lib/x/reply-text";

describe("buildOfficialReplyText", () => {
  it("includes top two try scorers and notable player hashtags", () => {
    expect(
      buildOfficialReplyText({
        awayScore: 17,
        awayTeamName: "東京サントリーサンゴリアス",
        competitionFamily: "league-one",
        homeScore: 24,
        homeTeamName: "コベルコ神戸スティーラーズ",
        language: "ja",
        tryScorers: [
          { count: 1, playerName: "山田太郎" },
          { count: 1, playerName: "佐藤次郎" },
          { count: 1, playerName: "鈴木三郎" },
        ],
      }),
    ).toBe(
      [
        "コベルコ神戸スティーラーズ 24-17。",
        "コベルコ神戸スティーラーズが終盤の勝負どころを押さえて接戦を締めました。",
        "山田太郎がトライ、佐藤次郎がトライ。",
        "#ブロディレタリック #アーディサベア #アントンリネルトブラウン #リーグワン #ラグビー",
      ].join("\n"),
    );
  });

  it("returns the score line and match read when try scorers are missing", () => {
    expect(
      buildOfficialReplyText({
        awayScore: 12,
        awayTeamName: "Away",
        competitionFamily: "six-nations",
        homeScore: 10,
        homeTeamName: "Home",
        language: "en",
        tryScorers: [],
      }),
    ).toBe(
      "Home 10-12 Away.\nAway held their nerve late and closed out a tight match.",
    );
  });

  it("uses N tries wording for players with multiple tries", () => {
    expect(
      buildOfficialReplyText({
        awayScore: 17,
        awayTeamName: "東京サントリーサンゴリアス",
        competitionFamily: "league-one",
        homeScore: 31,
        homeTeamName: "コベルコ神戸スティーラーズ",
        language: "ja",
        tryScorers: [{ count: 2, playerName: "山田太郎" }],
      }),
    ).toContain("山田太郎が2トライ");

    expect(
      buildOfficialReplyText({
        awayScore: 17,
        awayTeamName: "Tokyo Sungoliath",
        competitionFamily: "league-one",
        homeScore: 31,
        homeTeamName: "Kobelco Kobe Steelers",
        language: "en",
        tryScorers: [{ count: 2, playerName: "Taro Yamada" }],
      }),
    ).toContain("Taro Yamada scored 2 tries");
  });
});
