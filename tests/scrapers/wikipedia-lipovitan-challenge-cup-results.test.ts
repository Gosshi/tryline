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

function rugbyboxHtml(params: Record<string, string>) {
  const dataMw = JSON.stringify({
    parts: [
      {
        template: {
          params: Object.fromEntries(
            Object.entries(params).map(([key, wt]) => [key, { wt }]),
          ),
          target: { wt: "rugbybox\n" },
        },
      },
    ],
  });

  return `<table data-mw='${dataMw}'><tbody><tr><td>レンダリング済みテキストには依存しない</td></tr></tbody></table>`;
}

const JAPANESE_HTML = [
  rugbyboxHtml({
    away: "{{RU|AUS}}",
    date: "2026年8月8日(土)",
    home: "{{ru-rt|JPN}}",
    score: "",
    stadium: "[[東大阪市花園ラグビー場]] ([[大阪府]][[東大阪市]])",
    time: "19:05 [[日本標準時|JST]] ([[UTC+9]])",
  }),
  rugbyboxHtml({
    away: "{{RU|CAN}}",
    date: "2026年9月5日(土)",
    home: "{{ru-rt|JPN}}",
    score: "",
    stadium:
      "[[新潟スタジアム|デンカビッグスワンスタジアム]] ([[新潟県]][[新潟市]])",
    time: "14:50 [[日本標準時|JST]] ([[UTC+9]])",
  }),
  rugbyboxHtml({
    away: "{{RU|FIJ}}",
    date: "2026年10月24日(土)",
    home: "{{ru-rt|JPN}}",
    score: "",
    stadium: "[[秩父宮ラグビー場]] ([[東京都]][[港区 (東京都)|港区]])",
    time: "14:50 [[日本標準時|JST]] ([[UTC+9]])",
  }),
  rugbyboxHtml({
    away: "{{RU|MAB}}",
    date: "2026年6月27日(土)",
    home: "{{ru-rt|JXV}}",
    score: "31-38&lt;br />&lt;small>24-前半-7&lt;/small>",
    stadium: "[[パロマ瑞穂スタジアム]]",
    time: "19:05 [[日本標準時|JST]] ([[UTC+9]])",
  }),
].join("\n");

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

  it("parses data-mw rugbybox templates and excludes JAPAN XV", () => {
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

  it("uses the first score in a rugbybox score parameter", () => {
    const results = parseLipovitanChallengeCupResultsHtml(
      rugbyboxHtml({
        away: "{{RU|AUS}}",
        date: "2026年8月8日(土)",
        home: "{{ru-rt|JPN}}",
        score: "18-12&lt;br />&lt;small>10-5&lt;/small>",
        stadium: "[[東大阪市花園ラグビー場]]",
        time: "19:05 [[日本標準時|JST]] ([[UTC+9]])",
      }),
    );

    expect(results).toEqual([
      expect.objectContaining({
        away_score: 12,
        home_score: 18,
        status: "finished",
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
              rugbyboxHtml({
                away: "{{RU|FIJ}}",
                date: "2026年10月24日(土)",
                home: "{{ru-rt|JPN}}",
                score: "",
                stadium:
                  "[[秩父宮ラグビー場]] ([[東京都]][[港区 (東京都)|港区]])",
                time: "14:50 [[日本標準時|JST]] ([[UTC+9]])",
              }),
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
