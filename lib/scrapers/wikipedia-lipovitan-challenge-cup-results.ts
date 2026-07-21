import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type LipovitanChallengeCupMatchResult = {
  season: number;
  round: number | null;
  kickoff_at: string;
  home_team_slug: string;
  away_team_slug: string;
  home_score: number | null;
  away_score: number | null;
  status: "finished" | "scheduled";
  venue: string | null;
  source_url: string;
  wikipedia_event_id: string | null;
};

export interface LipovitanChallengeCupResultScraper {
  fetchResults(season: string): Promise<LipovitanChallengeCupMatchResult[]>;
}

const JAPANESE_WIKIPEDIA_URL =
  "https://ja.wikipedia.org/wiki/%E3%83%AA%E3%83%9D%E3%83%93%E3%82%BF%E3%83%B3D%E3%83%81%E3%83%A3%E3%83%AC%E3%83%B3%E3%82%B8%E3%82%AB%E3%83%83%E3%83%972026";
const AUSTRALIA_JAPAN_WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2026_Australia%E2%80%93Japan_rugby_union_test_series";
const JAPAN_FIJI_JRFU_URL = "https://www.rugby-japan.jp/news/54073";

const TEAM_SLUG_BY_NAME: Record<string, string> = {
  Australia: "australia",
  Canada: "canada",
  Fiji: "fiji",
  Japan: "japan",
  "オーストラリア": "australia",
  オーストラリア代表: "australia",
  カナダ: "canada",
  カナダ代表: "canada",
  フィジー: "fiji",
  フィジー代表: "fiji",
  日本: "japan",
  日本代表: "japan",
};

const MATCHUPS = [
  { away: "australia", home: "japan" },
  { away: "canada", home: "japan" },
  { away: "fiji", home: "japan" },
  { away: "japan", home: "australia" },
] as const;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function assertSeason(season: string) {
  if (season !== "2026") {
    throw new Error(`Lipovitan Challenge Cup season must be 2026: ${season}`);
  }
}

function toKickoffAt(month: string, day: string, hour: string, minute: string) {
  return new Date(
    Date.UTC(2026, Number(month) - 1, Number(day), Number(hour) - 9, Number(minute)),
  ).toISOString();
}

function findTeams(rowText: string): [string, string] | null {
  const names = Object.keys(TEAM_SLUG_BY_NAME)
    .map((name) => ({ index: rowText.indexOf(name), name }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index);
  const slugs = names
    .map(({ name }) => TEAM_SLUG_BY_NAME[name]!)
    .filter((slug, index, all) => index === 0 || slug !== all[index - 1]);

  return slugs.length >= 2 ? [slugs[0]!, slugs[1]!] : null;
}

function parseScore(rowText: string) {
  const score = rowText.match(/(?:^|\s)(\d+)\s*[–-]\s*(\d+)(?:\s|$)/);

  if (!score) {
    return { awayScore: null, homeScore: null, status: "scheduled" as const };
  }

  return {
    awayScore: Number(score[2]),
    homeScore: Number(score[1]),
    status: "finished" as const,
  };
}

function getMatchup(home: string, away: string) {
  return MATCHUPS.find(
    (matchup) => matchup.home === home && matchup.away === away,
  );
}

function parseJapaneseFixtureRows(
  html: string,
  sourceUrl: string,
): LipovitanChallengeCupMatchResult[] {
  const $ = load(html);
  const fixtures = new Map<string, LipovitanChallengeCupMatchResult>();

  $("table tr").each((_, row) => {
    const rowElement = $(row);
    const rowText = normalizeWhitespace(rowElement.text());
    const date = rowText.match(/2026年\s*(\d{1,2})月\s*(\d{1,2})日/);
    const time = rowText.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
    const teams = findTeams(rowText);

    if (!date || !time || !teams || !getMatchup(teams[0], teams[1])) {
      return;
    }

    const [homeTeamSlug, awayTeamSlug] = teams;
    const score = parseScore(rowText);
    const venue = normalizeWhitespace(
      rowElement.find("a").last().text() || rowElement.find("td").last().text(),
    );
    const kickoffAt = toKickoffAt(date[1]!, date[2]!, time[1]!, time[2]!);
    const eventId = `${homeTeamSlug}-vs-${awayTeamSlug}-${kickoffAt.slice(0, 10)}`;

    fixtures.set(eventId, {
      away_score: score.awayScore,
      away_team_slug: awayTeamSlug,
      home_score: score.homeScore,
      home_team_slug: homeTeamSlug,
      kickoff_at: kickoffAt,
      round: null,
      season: 2026,
      source_url: sourceUrl,
      status: score.status,
      venue: venue || null,
      wikipedia_event_id: eventId,
    });
  });

  return [...fixtures.values()];
}

export function parseLipovitanChallengeCupResultsHtml(
  html: string,
  sourceUrl = JAPANESE_WIKIPEDIA_URL,
): LipovitanChallengeCupMatchResult[] {
  return parseJapaneseFixtureRows(html, sourceUrl);
}

export function parseAustraliaJapanTestSeriesResultsHtml(
  html: string,
  sourceUrl = AUSTRALIA_JAPAN_WIKIPEDIA_URL,
): LipovitanChallengeCupMatchResult[] {
  const $ = load(html);
  const row = $("table tr")
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .find(
      (text) =>
        text.includes("15 August") &&
        text.includes("Australia") &&
        text.includes("Japan") &&
        text.includes("Townsville"),
    );

  if (!row) {
    throw new Error("Unable to find the Australia vs Japan Townsville fixture.");
  }

  const score = parseScore(row);
  const kickoffAt = "2026-08-15T05:00:00.000Z";

  return [
    {
      away_score: score.awayScore,
      away_team_slug: "japan",
      home_score: score.homeScore,
      home_team_slug: "australia",
      kickoff_at: kickoffAt,
      round: null,
      season: 2026,
      source_url: sourceUrl,
      status: score.status,
      venue: "North Queensland Stadium, Townsville",
      wikipedia_event_id: "Australia-vs-Japan-2026-08-15",
    },
  ];
}

export function parseJapanFijiOfficialResultsHtml(
  html: string,
  sourceUrl = JAPAN_FIJI_JRFU_URL,
): LipovitanChallengeCupMatchResult[] {
  const text = normalizeWhitespace(load(html).text());

  if (
    !text.includes("日本代表") ||
    !text.includes("フィジー代表") ||
    !text.includes("2026年10月24日") ||
    !text.includes("14:50")
  ) {
    throw new Error("Unable to find the Japan vs Fiji fixture in JRFU data.");
  }

  return [
    {
      away_score: null,
      away_team_slug: "fiji",
      home_score: null,
      home_team_slug: "japan",
      kickoff_at: "2026-10-24T05:50:00.000Z",
      round: null,
      season: 2026,
      source_url: sourceUrl,
      status: "scheduled",
      venue: "秩父宮ラグビー場",
      wikipedia_event_id: "Japan-vs-Fiji-2026-10-24",
    },
  ];
}

export const wikipediaLipovitanChallengeCupResultsScraper: LipovitanChallengeCupResultScraper =
  {
    async fetchResults(season: string) {
      assertSeason(season);
      const [japaneseResponse, australiaJapanResponse, japanFijiResponse] =
        await Promise.all([
          fetchWithPolicy(JAPANESE_WIKIPEDIA_URL),
          fetchWithPolicy(AUSTRALIA_JAPAN_WIKIPEDIA_URL),
          fetchWithPolicy(JAPAN_FIJI_JRFU_URL),
        ]);
      const [japaneseHtml, australiaJapanHtml, japanFijiHtml] = await Promise.all(
        [
          japaneseResponse.text(),
          australiaJapanResponse.text(),
          japanFijiResponse.text(),
        ],
      );
      const japaneseResults = parseLipovitanChallengeCupResultsHtml(
        japaneseHtml,
      );
      const hasJapanFijiFixture = japaneseResults.some(
        (result) =>
          result.home_team_slug === "japan" && result.away_team_slug === "fiji",
      );

      return [
        ...japaneseResults,
        ...parseAustraliaJapanTestSeriesResultsHtml(australiaJapanHtml),
        ...(hasJapanFijiFixture
          ? []
          : parseJapanFijiOfficialResultsHtml(japanFijiHtml)),
      ];
    },
  };
