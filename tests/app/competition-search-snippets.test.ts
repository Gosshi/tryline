import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSeasons: vi.fn(),
  getCompetition: vi.fn(),
  listMatches: vi.fn(),
  broadcasts: vi.fn(),
  standings: vi.fn(),
  content: vi.fn(),
}));
vi.mock("@/lib/db/queries/competitions", async (original) => ({
  ...(await original<typeof import("@/lib/db/queries/competitions")>()),
  listSeasonsByFamily: mocks.listSeasons,
  getCompetitionBySlug: mocks.getCompetition,
}));
vi.mock("@/lib/db/queries/matches", () => ({
  listMatchesForCompetition: mocks.listMatches,
}));
vi.mock("@/lib/db/queries/match-broadcasts", () => ({
  getMatchBroadcastsForMatches: mocks.broadcasts,
}));
vi.mock("@/lib/db/queries/standings", () => ({
  getStandingsForCompetition: mocks.standings,
}));
vi.mock("@/lib/db/queries/match-content", () => ({
  getContentStatusForMatches: mocks.content,
}));

import { generateMetadata as generateSeasonMetadata } from "@/app/c/[competition]/[season]/page";
import { generateMetadata as generateHubMetadata } from "@/app/c/[competition]/page";
import { generateMetadata as generateRwcMetadata } from "@/app/c/rwc/2027/page";
import { formatCompetitionBroadcastSentence } from "@/lib/format/season-summary";

import {
  competitionBroadcasts,
  japanRwcMatches,
  leagueOneMatches,
  leagueOneSeason,
  snippetMatch,
} from "../fixtures/competition-search-snippets";

import type { StandingRow } from "@/lib/db/queries/standings";

const broadcastSentence =
  "J SPORTS（BS）・J SPORTSオンデマンド・DAZNで全試合を視聴できます（11月16日確認）。";
const overview =
  "ジャパンラグビー リーグワンは、日本の最高峰クラブが争う国内プロラグビーリーグです。シーズンを通じて上位進出と優勝を争います。";
const closing =
  " 最新シーズンの順位表・日程・試合結果と、日本での視聴方法を掲載。";
const oldHubTitle =
  "ジャパンラグビー リーグワン 順位表・日程・日本での視聴方法";
const newHubTitle =
  "ジャパンラグビー リーグワン 2026-27 日程・順位表・日本での視聴方法";
const hubParams = (competition = "league-one") => ({
  params: Promise.resolve({ competition }),
});
const seasonParams = (competition = "league-one", season = "2026-27") => ({
  params: Promise.resolve({ competition, season }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
  mocks.listSeasons.mockResolvedValue([leagueOneSeason]);
  mocks.getCompetition.mockResolvedValue(leagueOneSeason);
  mocks.listMatches.mockResolvedValue(leagueOneMatches);
  mocks.broadcasts.mockResolvedValue(
    new Map([[leagueOneMatches[0]!.id, [...competitionBroadcasts].reverse()]]),
  );
  mocks.standings.mockResolvedValue([]);
  mocks.content.mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("competition broadcast sentence", () => {
  it("uses only competition rows, deduplicates by service, and keeps the existing order and JST date", () => {
    const rows = competitionBroadcasts.map((row, index) => ({
      ...row,
      verifiedAt:
        index === 0 ? "2026-11-15T15:10:00Z" : "2026-11-16T00:05:00+09:00",
    }));
    const sentence = formatCompetitionBroadcastSentence(
      new Map([
        ["A", [...rows].reverse()],
        ["B", rows],
        [
          "C",
          [
            {
              ...rows[0]!,
              scope: "match",
              verifiedAt: "2029-01-01T00:00:00Z",
              serviceName: "Excluded match-only service",
            },
          ],
        ],
      ]),
    );
    expect(sentence).toBe(broadcastSentence);
  });
  it("returns null for match-only rows and for no rows", () => {
    expect(formatCompetitionBroadcastSentence(new Map())).toBeNull();
    expect(
      formatCompetitionBroadcastSentence(
        new Map([
          [
            "A",
            competitionBroadcasts.map((row) => ({ ...row, scope: "match" })),
          ],
        ]),
      ),
    ).toBeNull();
  });
});

describe("RWC 2027 metadata", () => {
  const title =
    "ラグビーワールドカップ2027 日程（日本時間）・日本代表の試合・出場国";
  const fallback =
    "2027年10月1日〜11月13日にオーストラリアで開催。全52試合の日程を日本時間で掲載し、プール順位表・決勝トーナメント表も確認できます。";
  it("uses actual opponents in kickoff order, with Japan on either side and dates in JST", async () => {
    mocks.listMatches.mockResolvedValue([
      japanRwcMatches[2],
      snippetMatch({
        homeTeam: { name: "Other", slug: "other", shortCode: "OTH" },
      }),
      japanRwcMatches[1],
      japanRwcMatches[0],
    ]);
    const metadata = await generateRwcMetadata();
    expect(metadata).toEqual({
      title,
      description:
        "2027年10月1日〜11月13日にオーストラリアで開催。日本代表はサモア（10月3日）・フランス（10月9日）・アメリカ（10月15日）と対戦。全52試合の日程を日本時間で掲載し、プール順位表・決勝トーナメント表も確認できます。",
    });
    expect(metadata.description).not.toMatch(/放送|視聴/);
    expect(Object.hasOwn(metadata, "openGraph")).toBe(false);
    expect(mocks.listMatches).toHaveBeenCalledExactlyOnceWith("rwc-2027");
  });
  it("omits the Japan sentence when no Japan fixtures exist", async () => {
    mocks.listMatches.mockResolvedValue([]);
    expect(await generateRwcMetadata()).toEqual({
      title,
      description: fallback,
    });
  });
  it("returns the fallback and logs once on a match query error", async () => {
    const error = new Error("RWC query failed");
    mocks.listMatches.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await generateRwcMetadata()).toEqual({
      title,
      description: fallback,
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[rwc-2027-metadata] Failed to load matches",
      error,
    );
  });
});

describe("family hub metadata", () => {
  it("uses the current season, 101 non-cancelled matches, opening date and all-match services exactly", async () => {
    // The latest season by date has no fixtures: use the same selector as the page body.
    mocks.listSeasons.mockResolvedValue([
      {
        ...leagueOneSeason,
        id: "future",
        slug: "league-one-2027-28",
        season: "2027-28",
        matchCount: 0,
      },
      leagueOneSeason,
    ]);
    mocks.listMatches.mockResolvedValue(
      [...leagueOneMatches]
        .reverse()
        .concat(
          snippetMatch({
            id: "cancelled",
            status: "cancelled",
            kickoffAt: "2020-01-01T00:00:00Z",
          }),
        ),
    );
    const metadata = await generateHubMetadata(hubParams());
    const description =
      "ジャパンラグビー リーグワン 2026-27は12月12日開幕、全101試合の日程を日本時間で掲載。" +
      broadcastSentence +
      overview +
      closing;
    expect(metadata).toMatchObject({
      title: newHubTitle,
      description,
      openGraph: { description, title: newHubTitle + " | Tryline" },
    });
    expect(mocks.listMatches).toHaveBeenCalledExactlyOnceWith(
      "league-one-2026-27",
    );
    expect(mocks.broadcasts).toHaveBeenCalledWith(
      expect.arrayContaining(leagueOneMatches.map((match) => match.id)),
    );
  });
  it.each([
    [
      "active",
      [snippetMatch({ status: "finished" }), snippetMatch({ id: "scheduled" })],
      "ジャパンラグビー リーグワン 2026-27の最新結果・次の試合・日程を日本時間で掲載。",
    ],
    [
      "post",
      [snippetMatch({ status: "finished" })],
      "ジャパンラグビー リーグワン 2026-27の全試合結果を掲載。",
    ],
    ["information", [], ""],
  ] as const)(
    "uses the %s opening sentence and always preserves the closing sentence",
    async (_state, matches, opening) => {
      mocks.listMatches.mockResolvedValue(matches);
      mocks.broadcasts.mockResolvedValue(new Map());
      const metadata = await generateHubMetadata(hubParams());
      expect(metadata).toMatchObject({
        title: newHubTitle,
        description: opening + overview + closing,
        openGraph: { description: opening + overview + closing },
      });
    },
  );
  it("preserves the special Lipovitan title even with a latest season", async () => {
    mocks.listSeasons.mockResolvedValue([
      {
        ...leagueOneSeason,
        family: "lipovitan-challenge-cup",
        nameJa: "リポビタンDチャレンジカップ",
        slug: "lipovitan-challenge-cup-2026",
        season: "2026",
      },
    ]);
    expect(
      (await generateHubMetadata(hubParams("lipovitan-challenge-cup"))).title,
    ).toBe("リポビタンDチャレンジカップ オーストラリア・カナダ・フィジー代表");
  });
  it("uses the original title and description when no season exists", async () => {
    mocks.listSeasons.mockResolvedValue([]);
    expect(await generateHubMetadata(hubParams())).toMatchObject({
      title: oldHubTitle,
      description: overview + closing,
    });
    expect(mocks.listMatches).not.toHaveBeenCalled();
    expect(mocks.broadcasts).not.toHaveBeenCalled();
  });
  it.each(["listSeasons", "listMatches", "broadcasts"] as const)(
    "returns the original metadata on %s errors",
    async (stage) => {
      const error = new Error(`${stage} failed`);
      mocks[stage].mockRejectedValue(error);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await generateHubMetadata(hubParams())).toMatchObject({
        title: oldHubTitle,
        description: overview + closing,
        openGraph: { description: overview + closing },
      });
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "[competition-hub-metadata] Failed to load season data",
        error,
      );
    },
  );
});

describe("season metadata descriptions", () => {
  const leagueDescription =
    "ジャパンラグビー リーグワン 2026-27は12チームが参加する全101試合。2026/12/12〜2027/5/9の日程・見どころを掲載。";
  it("appends the competition sentence to the exact League One season description", async () => {
    const description = leagueDescription + broadcastSentence;
    expect(await generateSeasonMetadata(seasonParams())).toMatchObject({
      title: "ジャパンラグビー リーグワン 2026-27 日程・見どころ",
      description,
      openGraph: { description },
    });
    expect(mocks.broadcasts).toHaveBeenCalledExactlyOnceWith(
      leagueOneMatches.map((match) => match.id),
    );
  });
  it.each(["empty", "match-only"])(
    "does not append a viewing sentence with %s rows",
    async (kind) => {
      mocks.broadcasts.mockResolvedValue(
        kind === "empty"
          ? new Map()
          : new Map([
              [
                leagueOneMatches[0]!.id,
                competitionBroadcasts.map((row) => ({
                  ...row,
                  scope: "match",
                })),
              ],
            ]),
      );
      expect((await generateSeasonMetadata(seasonParams())).description).toBe(
        leagueDescription,
      );
    },
  );
  it("keeps the original description and logs once if the broadcast read fails", async () => {
    const error = new Error("broadcast read failed");
    mocks.broadcasts.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await generateSeasonMetadata(seasonParams())).toMatchObject({
      description: leagueDescription,
      openGraph: { description: leagueDescription },
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[competition-season-metadata] Failed to load broadcasts",
      error,
    );
  });
  const teams = ["アメリカ", "カナダ", "フィジー", "日本"];
  it.each([false, true])(
    "includes Japanese review exactly once and retains standings=%s",
    async (hasStandings) => {
      const matches = Array.from({ length: 4 }, (_, index) =>
        snippetMatch({
          id: `pnc-${index}`,
          status: "finished",
          homeScore: 24,
          awayScore: 17,
          kickoffAt:
            index === 0 ? "2026-09-12T05:00:00Z" : "2026-09-19T05:00:00Z",
          homeTeam: {
            name: teams[index]!,
            slug: `pnc-team-${index}`,
            shortCode: `P${index}`,
          },
          awayTeam: {
            name: teams[(index + 1) % 4]!,
            slug: `pnc-team-${(index + 1) % 4}`,
            shortCode: `P${(index + 1) % 4}`,
          },
        }),
      );
      mocks.getCompetition.mockResolvedValue({
        ...leagueOneSeason,
        slug: "pnc-2026",
        family: "pnc",
        season: "2026",
        nameJa: "パシフィック・ネーションズカップ",
        matchCount: 4,
      });
      mocks.listMatches.mockResolvedValue(matches);
      mocks.broadcasts.mockResolvedValue(new Map());
      mocks.content.mockResolvedValue({
        "pnc-0": { hasPreview: false, hasRecap: true },
      });
      const standings: StandingRow[] = teams.map((teamName, index) => ({
        position: index + 1,
        teamName,
        teamShortCode: `P${index}`,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        pointsFor: 24,
        pointsAgainst: 17,
        triesFor: 3,
        bonusPointsTry: 0,
        bonusPointsLosing: 0,
        totalPoints: 4,
      }));
      mocks.standings.mockResolvedValue(hasStandings ? standings : []);
      const metadata = await generateSeasonMetadata(
        seasonParams("pnc", "2026"),
      );
      expect(metadata.description).toBe(
        "パシフィック・ネーションズカップ 2026はアメリカ・カナダ・フィジー・日本が参加する全4試合。2026/9/12〜2026/9/19の全試合結果・日本語レビュー" +
          (hasStandings ? "・順位表" : "") +
          "を掲載。",
      );
      expect(metadata.description?.match(/日本語レビュー/g)).toHaveLength(1);
    },
  );
});
