import { describe, expect, it } from "vitest";

import {
  findNextScheduledMatch,
  formatMatchKickoffJst,
  getCompetitionHubState,
  getJapanMatchesNote,
  getLeaderLabel,
  getMatchLabel,
  getSeasonBroadcastGuide,
  getSeasonPeriodLabel,
  isJapanMatch,
  selectStandingsExcerpt,
} from "@/lib/format/season-summary";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { StandingRow } from "@/lib/db/queries/standings";

const baseMatch: MatchListItem = {
  awayScore: null,
  awayTeam: { name: "New Zealand", shortCode: "NZL", slug: "new-zealand" },
  homeScore: null,
  homeTeam: { name: "Japan", shortCode: "JPN", slug: "japan" },
  id: "match-1",
  kickoffAt: "2027-10-01T18:45:00Z",
  poolName: null,
  round: null,
  roundName: null,
  status: "scheduled",
  venue: null,
};

const standing = (teamName: string, position: number): StandingRow => ({
  bonusPointsLosing: 0,
  bonusPointsTry: 0,
  drawn: 0,
  lost: 0,
  played: 3,
  pointsAgainst: 10,
  pointsFor: 20,
  position,
  teamName,
  teamShortCode: teamName === "Japan" ? "JPN" : "RSA",
  totalPoints: 12,
  triesFor: 3,
  won: 3,
});

describe("season summary helpers", () => {
  it("formats kickoffs in Japan time and finds the next scheduled match", () => {
    expect(formatMatchKickoffJst(baseMatch.kickoffAt)).toContain("2027-10-02");
    expect(
      findNextScheduledMatch([baseMatch], new Date("2027-10-01T00:00:00Z"))?.id,
    ).toBe("match-1");
  });

  it("formats match labels, detects Japan, and classifies season states", () => {
    expect(isJapanMatch(baseMatch)).toBe(true);
    expect(getMatchLabel(baseMatch)).toBe("Japan 対 New Zealand");
    expect(getCompetitionHubState([baseMatch])).toBe("pre");
    expect(getCompetitionHubState([{ ...baseMatch, status: "finished" }])).toBe(
      "post",
    );
    expect(
      getCompetitionHubState([{ ...baseMatch, status: "cancelled" }]),
    ).toBe("information");
  });

  it("builds a broadcast guide from the most recently verified service entries", () => {
    const result = getSeasonBroadcastGuide(
      new Map([
        [
          "match-1",
          [
            {
              displayOrder: 1,
              kind: "streaming",
              serviceName: "DAZN",
              sourceUrl: null,
              url: "https://example.com/dazn",
              verifiedAt: "2027-01-01T00:00:00Z",
            },
          ],
        ],
      ]),
    );

    expect(result.answer).toContain("DAZN");
    expect(result.services[0]?.serviceName).toBe("DAZN");
    expect(getSeasonBroadcastGuide(new Map()).services).toEqual([]);
  });

  it("selects the top three standings and Japan when requested", () => {
    const rows = [
      standing("South Africa", 1),
      standing("France", 2),
      standing("Ireland", 3),
      standing("Japan", 4),
    ];

    expect(
      selectStandingsExcerpt(rows, true).map((row) => row.teamName),
    ).toEqual(["South Africa", "France", "Ireland", "Japan"]);
  });

  it("formats pool and single-table leaders and omits preseason leaders", () => {
    expect(
      getLeaderLabel({
        poolStandings: [
          { poolName: "Pool A", standings: [standing("South Africa", 1)] },
          { poolName: "Pool B", standings: [standing("France", 1)] },
        ],
        seasonNotStarted: false,
        standings: [],
      }),
    ).toBe("プールA: South Africa / プールB: France");
    expect(
      getLeaderLabel({
        poolStandings: [],
        seasonNotStarted: false,
        standings: [standing("South Africa", 1)],
      }),
    ).toBe("South Africa");
    expect(
      getLeaderLabel({
        poolStandings: [],
        seasonNotStarted: true,
        standings: [standing("South Africa", 1)],
      }),
    ).toBeNull();
  });

  it("shows the Nations Championship finals note only until Japan's finals match is known", () => {
    expect(
      getJapanMatchesNote({
        competitionSlug: "nations-championship-2026",
        matches: [{ ...baseMatch, kickoffAt: "2026-11-21T14:10:00Z" }],
      }),
    ).toBe(
      "11月27〜29日のファイナルズ週末（ロンドン・トゥイッケナム）で、日本は最終順位に応じた順位決定戦をもう1試合戦います。対戦相手と日時は第6節（11月21日）の後に決まります。",
    );
    expect(
      getJapanMatchesNote({
        competitionSlug: "nations-championship-2026",
        matches: [{ ...baseMatch, kickoffAt: "2026-11-28T16:40:00Z" }],
      }),
    ).toBeNull();
    expect(
      getJapanMatchesNote({
        competitionSlug: "pnc-2026",
        matches: [{ ...baseMatch, kickoffAt: "2026-11-21T14:10:00Z" }],
      }),
    ).toBeNull();
  });

  it("uses known dates, post-season JST match dates, and no inferred preseason dates", () => {
    expect(
      getSeasonPeriodLabel({
        competitionSlug: "rwc-2027",
        matches: [baseMatch],
        state: "pre",
      }),
    ).toBe("2027年10月1日〜2027年11月13日");
    expect(
      getSeasonPeriodLabel({
        competitionSlug: "nations-championship-2026",
        matches: [baseMatch],
        state: "post",
      }),
    ).toBe("2026年7月4日〜2026年11月29日");
    expect(
      getSeasonPeriodLabel({
        competitionSlug: "rwc-2031",
        matches: [baseMatch],
        state: "pre",
      }),
    ).toBeNull();
    expect(
      getSeasonPeriodLabel({
        competitionSlug: "pnc-2026",
        matches: [
          {
            ...baseMatch,
            kickoffAt: "2026-09-12T10:05:00Z",
            status: "finished",
          },
          {
            ...baseMatch,
            id: "match-2",
            kickoffAt: "2026-09-19T15:30:00Z",
            status: "finished",
          },
          {
            ...baseMatch,
            id: "match-3",
            kickoffAt: "2026-09-26T10:00:00Z",
            status: "cancelled",
          },
        ],
        state: "post",
      }),
    ).toBe("2026年9月12日〜2026年9月20日");
    expect(
      getSeasonPeriodLabel({
        competitionSlug: "one-day-2026",
        matches: [
          {
            ...baseMatch,
            kickoffAt: "2026-08-07T15:00:00Z",
            status: "finished",
          },
        ],
        state: "post",
      }),
    ).toBe("2026年8月8日");
  });

  it("uses Japan-local match dates when the UTC date crosses midnight", () => {
    expect(
      getSeasonPeriodLabel({
        competitionSlug: "pnc-2026",
        matches: [
          {
            ...baseMatch,
            kickoffAt: "2026-09-12T10:05:00Z",
            status: "finished",
          },
          {
            ...baseMatch,
            id: "match-last",
            kickoffAt: "2026-09-19T15:30:00Z",
            status: "finished",
          },
        ],
        state: "post",
      }),
    ).toBe("2026年9月12日〜2026年9月20日");
  });
});
