import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcherMocks = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));

vi.mock("@/lib/scrapers/fetcher", () => fetcherMocks);

import {
  parseAustraliaJapanTestSeriesResultsHtml,
  parseJapanFijiOfficialResultsHtml,
  parseLipovitanChallengeCupResultsHtml,
  wikipediaLipovitanChallengeCupResultsScraper,
} from "@/lib/scrapers/wikipedia-lipovitan-challenge-cup-results";

const JAPANESE_HTML = `
<table class="wikitable">
  <tbody>
    <tr><th>日時</th><th>ホーム</th><th>スコア</th><th>アウェイ</th><th>会場</th></tr>
    <tr>
      <td>2026年8月8日(土) 19:05</td>
      <td><a>日本代表</a></td><td>-</td><td><a>オーストラリア代表</a></td>
      <td><a>東大阪市花園ラグビー場</a></td>
    </tr>
    <tr>
      <td>2026年9月5日(土) 14:50</td>
      <td><a>日本代表</a></td><td>-</td><td><a>カナダ代表</a></td>
      <td><a>デンカビッグスワンスタジアム</a></td>
    </tr>
    <tr>
      <td>2026年10月24日(土) 14:50</td>
      <td><a>日本代表</a></td><td>-</td><td><a>フィジー代表</a></td>
      <td><a>秩父宮ラグビー場</a></td>
    </tr>
    <tr>
      <td>2026年6月27日(土) 19:05</td>
      <td><a>JAPAN XV</a></td><td>31-38</td><td><a>マオリ・オールブラックス</a></td>
      <td><a>パロマ瑞穂スタジアム</a></td>
    </tr>
  </tbody>
</table>`;

const AUSTRALIA_JAPAN_HTML = `
<table class="wikitable">
  <tbody>
    <tr><th>Date</th><th>Venue</th><th>Home</th><th>Score</th><th>Away</th></tr>
    <tr>
      <td>15 August 2026</td><td>North Queensland Stadium, Townsville</td>
      <td>Australia</td><td></td><td>Japan</td>
    </tr>
  </tbody>
</table>`;

const JAPAN_FIJI_JRFU_HTML = `
<article>
  <p>2026年10月24日（土）14:50キックオフ</p>
  <p>対戦：男子日本代表 対 フィジー代表</p>
  <p>会場：秩父宮ラグビー場（東京）</p>
</article>`;

describe("Lipovitan Challenge Cup Wikipedia scrapers", () => {
  beforeEach(() => {
    fetcherMocks.fetchWithPolicy.mockReset();
  });

  it("parses the three Japan-hosted fixtures and excludes JAPAN XV", () => {
    const results = parseLipovitanChallengeCupResultsHtml(
      JAPANESE_HTML,
      "https://example.test/lipovitan",
    );

    expect(results).toHaveLength(3);
    expect(results).toEqual([
      expect.objectContaining({
        away_score: null,
        away_team_slug: "australia",
        home_score: null,
        home_team_slug: "japan",
        kickoff_at: "2026-08-08T10:05:00.000Z",
        status: "scheduled",
        venue: "東大阪市花園ラグビー場",
      }),
      expect.objectContaining({
        away_team_slug: "canada",
        kickoff_at: "2026-09-05T05:50:00.000Z",
        venue: "デンカビッグスワンスタジアム",
      }),
      expect.objectContaining({
        away_team_slug: "fiji",
        kickoff_at: "2026-10-24T05:50:00.000Z",
        venue: "秩父宮ラグビー場",
      }),
    ]);
  });

  it("parses the Townsville away fixture from the Australia-Japan series", () => {
    expect(
      parseAustraliaJapanTestSeriesResultsHtml(
        AUSTRALIA_JAPAN_HTML,
        "https://example.test/australia-japan",
      ),
    ).toEqual([
      expect.objectContaining({
        away_score: null,
        away_team_slug: "japan",
        home_score: null,
        home_team_slug: "australia",
        kickoff_at: "2026-08-15T05:00:00.000Z",
        status: "scheduled",
        venue: "North Queensland Stadium, Townsville",
      }),
    ]);
  });

  it("uses JRFU data as a Fiji fixture fallback until Wikipedia is updated", () => {
    expect(parseJapanFijiOfficialResultsHtml(JAPAN_FIJI_JRFU_HTML)).toEqual([
      expect.objectContaining({
        away_team_slug: "fiji",
        home_team_slug: "japan",
        kickoff_at: "2026-10-24T05:50:00.000Z",
        status: "scheduled",
        venue: "秩父宮ラグビー場",
      }),
    ]);
  });

  it("returns four fixtures when the Japanese Wikipedia page lacks Fiji", async () => {
    fetcherMocks.fetchWithPolicy.mockImplementation((url: string) => {
      const html = url.includes("Australia")
        ? AUSTRALIA_JAPAN_HTML
        : url.includes("rugby-japan.jp")
          ? JAPAN_FIJI_JRFU_HTML
          : JAPANESE_HTML.replace(
              /<tr>\s*<td>2026年10月24日[\s\S]*?<\/tr>/,
              "",
            );

      return Promise.resolve({ text: () => Promise.resolve(html) });
    });

    const results =
      await wikipediaLipovitanChallengeCupResultsScraper.fetchResults("2026");

    expect(results).toHaveLength(4);
    expect(results.map((result) => result.kickoff_at)).toEqual([
      "2026-08-08T10:05:00.000Z",
      "2026-09-05T05:50:00.000Z",
      "2026-08-15T05:00:00.000Z",
      "2026-10-24T05:50:00.000Z",
    ]);
  });
});
