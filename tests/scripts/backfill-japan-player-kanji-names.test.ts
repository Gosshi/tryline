import { describe, expect, it } from "vitest";

import {
  buildPlayerKanjiNameUpdates,
  parseJapanRosterNameCandidates,
  parseOptions,
} from "@/scripts/backfill-japan-player-kanji-names";

const sourceUrl = "https://www.rugby-japan.jp/news/54068";

describe("backfill-japan-player-kanji-names", () => {
  it("defaults to dry-run and requires explicit owner approval to apply", () => {
    expect(parseOptions([])).toEqual({ dryRun: true });
    expect(parseOptions(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      dryRun: false,
    });
    expect(() => parseOptions(["--apply"])).toThrow(
      "backfill-japan-player-kanji-names.ts",
    );
  });

  it("parses kanji and English names from JRFU roster table rows", () => {
    const candidates = parseJapanRosterNameCandidates(
      `
        <table>
          <tr><th>番号</th><th>名前</th></tr>
          <tr><td>1</td><td><span>大塚 壮二郎</span><span>Sojiro OTSUKA</span></td></tr>
          <tr><td>2</td><td><span>ハリー・ホッキングス</span><span>Harry HOCKINGS</span></td></tr>
          <tr><td>3</td><td><span>石田 吉平</span><span>Kippei ISHIDA</span></td></tr>
        </table>
      `,
      sourceUrl,
    );

    expect(candidates).toEqual([
      {
        englishName: "Sojiro OTSUKA",
        japaneseName: "大塚 壮二郎",
        sourceUrl,
      },
      {
        englishName: "Kippei ISHIDA",
        japaneseName: "石田 吉平",
        sourceUrl,
      },
    ]);
  });

  it("matches unfilled Japan players by English name without overwriting existing values", () => {
    const updates = buildPlayerKanjiNameUpdates(
      [
        { id: "otsuka", name: "Sojiro Otsuka", name_ja: null },
        { id: "ishida", name: "Kippei Ishida", name_ja: null },
        { id: "existing", name: "Kenji Sato", name_ja: "佐藤 健次" },
        { id: "unmatched", name: "Foreign Player", name_ja: null },
      ],
      [
        {
          englishName: "Sojiro OTSUKA",
          japaneseName: "大塚 壮二郎",
          sourceUrl,
        },
        {
          englishName: "Kippei ISHIDA",
          japaneseName: "石田 吉平",
          sourceUrl,
        },
      ],
    );

    expect(updates).toEqual([
      {
        englishName: "Sojiro OTSUKA",
        japaneseName: "大塚 壮二郎",
        playerId: "otsuka",
        sourceUrl,
      },
      {
        englishName: "Kippei ISHIDA",
        japaneseName: "石田 吉平",
        playerId: "ishida",
        sourceUrl,
      },
    ]);
  });
});
