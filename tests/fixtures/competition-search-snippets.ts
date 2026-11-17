import type { CompetitionRow } from "@/lib/db/queries/competitions";
import type { MatchBroadcast } from "@/lib/db/queries/match-broadcasts";
import type { MatchListItem } from "@/lib/db/queries/matches";

export function snippetMatch(
  overrides: Partial<MatchListItem> = {},
): MatchListItem {
  return {
    id: "snippet-match",
    kickoffAt: "2026-12-12T05:00:00.000Z",
    kickoffTimeTbd: false,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    homeTeam: { name: "日本", slug: "japan", shortCode: "JPN" },
    awayTeam: { name: "サモア", slug: "samoa", shortCode: "SAM" },
    poolName: null,
    round: null,
    roundName: null,
    venue: null,
    ...overrides,
  };
}

export const leagueOneSeason: CompetitionRow = {
  id: "league-one-season",
  slug: "league-one-2026-27",
  family: "league-one",
  name: "League One",
  nameJa: "ジャパンラグビー リーグワン",
  season: "2026-27",
  champion: null,
  startDate: "2026-12-12",
  endDate: "2027-05-09",
  totalRounds: null,
  matchCount: 101,
  publishedContentCount: 0,
  publishedRecapCount: 0,
};

export const leagueOneMatches = Array.from({ length: 101 }, (_, index) => {
  const first = Date.parse("2026-12-11T15:30:00Z");
  const last = Date.parse("2027-05-09T05:00:00Z");
  const home = (index % 6) * 2;
  return snippetMatch({
    id: `league-match-${index}`,
    kickoffAt: new Date(
      Math.round(first + ((last - first) * index) / 100),
    ).toISOString(),
    homeTeam: {
      name: `チーム${home + 1}`,
      slug: `team-${home}`,
      shortCode: `T${home}`,
    },
    awayTeam: {
      name: `チーム${home + 2}`,
      slug: `team-${home + 1}`,
      shortCode: `T${home + 1}`,
    },
  });
});

export const competitionBroadcasts: MatchBroadcast[] = [
  {
    displayOrder: 0,
    kind: "tv",
    scope: "competition",
    serviceName: "J SPORTS（BS）",
    sourceUrl: "https://example.test/announcement",
    url: "https://example.test/jsports",
    verifiedAt: "2026-11-16T12:00:00Z",
  },
  {
    displayOrder: 10,
    kind: "streaming",
    scope: "competition",
    serviceName: "J SPORTSオンデマンド",
    sourceUrl: "https://example.test/announcement",
    url: "https://example.test/jsports",
    verifiedAt: "2026-11-16T12:00:00Z",
  },
  {
    displayOrder: 20,
    kind: "streaming",
    scope: "competition",
    serviceName: "DAZN",
    sourceUrl: "https://example.test/announcement",
    url: "https://example.test/dazn",
    verifiedAt: "2026-11-16T12:00:00Z",
  },
];

export const japanRwcMatches = [
  snippetMatch({ id: "rwc-samoa", kickoffAt: "2027-10-02T15:30:00Z" }),
  snippetMatch({
    id: "rwc-france",
    kickoffAt: "2027-10-09T04:00:00Z",
    homeTeam: { name: "フランス", slug: "france", shortCode: "FRA" },
    awayTeam: { name: "日本", slug: "japan", shortCode: "JPN" },
  }),
  snippetMatch({
    id: "rwc-usa",
    kickoffAt: "2027-10-15T04:00:00Z",
    awayTeam: { name: "アメリカ", slug: "usa", shortCode: "USA" },
  }),
];
