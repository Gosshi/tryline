import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseNewsDigestFacts,
  runImportNewsDigestFacts,
} from "@/scripts/import-news-digest-facts";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
  matchRows: [] as unknown[],
  matchesBuilder: {
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
  sourcedFactsBuilder: {
    upsert: vi.fn(),
  },
}));

async function writeDigest(markdown: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "tryline-news-digest-"));
  const file = path.join(directory, "news-digest-2026-07-10.md");
  await writeFile(file, markdown, "utf8");
  return file;
}

function createMatchRow() {
  return {
    away_team: {
      name: "Ireland",
      name_ja: "アイルランド",
      short_code: "IRE",
      slug: "ireland",
    },
    home_team: {
      name: "Japan",
      name_ja: "日本",
      short_code: "JPN",
      slug: "japan",
    },
    id: "match-japan-ireland",
    kickoff_at: "2026-07-12T10:00:00.000Z",
  };
}

describe("import-news-digest-facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.matchRows = [createMatchRow()];
    dbMock.matchesBuilder.then.mockImplementation((resolve) =>
      Promise.resolve(resolve({ data: dbMock.matchRows, error: null })),
    );
    dbMock.sourcedFactsBuilder.upsert.mockResolvedValue({ error: null });
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return dbMock.matchesBuilder;
      if (table === "match_sourced_facts") return dbMock.sourcedFactsBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("parses fact blocks under matchup headings only", () => {
    const facts = parseNewsDigestFacts(`
## 日本 vs アイルランド

- **事実**: 日本代表の先発は、主将LOワーナー・ディアンズを含む。
  確度: 公式発表／出典: [日本ラグビーフットボール協会 登録メンバー発表](https://www.rugby-japan.jp/news/54051)／確認日時: 2026-07-10（JST）

## X reply素材候補

- **事実**: これは取り込まない。
  確度: 単一ソース報道／出典: [BBC](https://www.bbc.com/sport/rugby-union/example)／確認日時: 2026-07-10（JST）
`);

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      confidenceLabel: "公式発表",
      heading: "日本 vs アイルランド",
      sourceUrl: "https://www.rugby-japan.jp/news/54051",
      teamA: "日本",
      teamB: "アイルランド",
    });
  });

  it("strips numbered heading prefixes and kickoff parentheses from team names", () => {
    const facts = parseNewsDigestFacts(`
## 3. オーストラリア vs フランス（7/11、ブリスベン）

- **事実**: フランスは主将アントワーヌ・デュポンが負傷離脱中で今節も不在。
  確度: 複数ソース一致（PlanetRugby、RugbyPass）／出典: [PlanetRugby](https://www.planetrugby.com/news/france-team-v-wallabies-romain-ntamack-and-matthieu-jalibert-start-with-top-14s-best)／確認日時: 2026-07-10（JST）
`);

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      heading: "3. オーストラリア vs フランス（7/11、ブリスベン）",
      sourceUrl:
        "https://www.planetrugby.com/news/france-team-v-wallabies-romain-ntamack-and-matthieu-jalibert-start-with-top-14s-best",
      teamA: "オーストラリア",
      teamB: "フランス",
    });
  });

  it("dry-runs allowed facts and excludes disallowed domains with reasons", async () => {
    const file = await writeDigest(`
## 日本 vs アイルランド

キックオフ: 2026-07-12 19:00 JST

- **事実**: Japan named Warner Dearns in the starting lineup for Ireland.
  確度: 単一ソース報道／出典: [BBC](https://www.bbc.com/sport/rugby-union/example)／確認日時: 2026-07-10（JST）
- **事実**: 日本代表の先発は、主将LOワーナー・ディアンズを含む。
  確度: 公式発表／出典: [日本ラグビーフットボール協会](https://www.rugby-japan.jp/news/54051)／確認日時: 2026-07-10（JST）
`);
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const result = await runImportNewsDigestFacts({
      db: { from: dbMock.from } as never,
      dryRun: true,
      file,
      logger,
      now: new Date("2026-07-10T09:00:00.000Z"),
    });

    expect(result).toMatchObject({
      dryRun: true,
      extracted: 2,
      matched: 1,
      upserted: 0,
    });
    expect(result.excluded).toEqual([
      expect.objectContaining({
        reason: "disallowed_domain",
        sourceDomain: "rugby-japan.jp",
      }),
    ]);
    expect(dbMock.matchesBuilder.gte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-07-09T15:00:00.000Z",
    );
    expect(dbMock.matchesBuilder.lte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-07-20T15:00:00.000Z",
    );
    expect(dbMock.sourcedFactsBuilder.upsert).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith("[dry-run] No rows were written.");
  });

  it("upserts matched facts with the sourced facts conflict key", async () => {
    const file = await writeDigest(`
## 日本 vs アイルランド

- **事実**: Japan named Warner Dearns in the starting lineup for Ireland.
  確度: 複数ソース一致／出典: [BBC](https://www.bbc.com/sport/rugby-union/example)／確認日時: 2026-07-10（JST）
`);

    const result = await runImportNewsDigestFacts({
      db: { from: dbMock.from } as never,
      dryRun: false,
      file,
      logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
      now: new Date("2026-07-10T09:00:00.000Z"),
    });

    expect(result.upserted).toBe(1);
    expect(dbMock.sourcedFactsBuilder.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          confidence: "high",
          content_type: "preview",
          fact: "Japan named Warner Dearns in the starting lineup for Ireland.",
          match_id: "match-japan-ireland",
          model_version: "news-digest-import@1.0.0",
          source_domain: "bbc.com",
          source_url: "https://www.bbc.com/sport/rugby-union/example",
        }),
      ],
      { onConflict: "match_id,fact" },
    );
  });
});
