// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import {
  isValidElement,
  Suspense,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RWC2027Page from "@/app/c/rwc/2027/page";

import type { MatchContentStatus } from "@/lib/db/queries/match-content";
import type { MatchListItem } from "@/lib/db/queries/matches";
import type { PoolStanding, StandingRow } from "@/lib/db/queries/standings";
import type { GroupKey } from "@/lib/format/match-groups";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
  getCompetitionGuide: vi.fn(),
}));

const contentStatusMock = vi.hoisted(() => ({
  getContentStatusMap: vi.fn(),
}));

const matchesMock = vi.hoisted(() => ({
  listMatchesForCompetition: vi.fn(),
}));

const standingsMock = vi.hoisted(() => ({
  getPoolStandingsForCompetition: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/season-match-groups", () => ({
  SeasonMatchGroups: ({
    groupedMatches,
  }: {
    groupedMatches: Array<[GroupKey, MatchListItem[]]>;
  }) => {
    const matchCount = groupedMatches.reduce(
      (total, [, matches]) => total + matches.length,
      0,
    );

    return (
      <section aria-label="RWC 2027 全日程">
        <p>全{matchCount}試合の日程</p>
        {groupedMatches.flatMap(([, matches]) =>
          matches.map((match) => (
            <a href={`/matches/${match.id}`} key={match.id} />
          )),
        )}
      </section>
    );
  },
}));

vi.mock("@/lib/db/queries/competitions", () => competitionsMock);
vi.mock("@/lib/db/queries/match-content", () => contentStatusMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/standings", () => standingsMock);

const competition = {
  family: "rwc",
  name: "Rugby World Cup 2027",
  season: "2027",
  slug: "rwc-2027",
};

function containsSuspenseBoundary(node: ReactNode): boolean {
  if (Array.isArray(node)) {
    return node.some(containsSuspenseBoundary);
  }

  if (!isValidElement(node)) {
    return false;
  }

  if (node.type === Suspense) {
    return true;
  }

  return containsSuspenseBoundary(
    (node.props as { children?: ReactNode }).children ?? null,
  );
}

function buildStanding(poolIndex: number, teamIndex: number): StandingRow {
  const teamNumber = poolIndex * 4 + teamIndex + 1;

  return {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 0,
    played: 0,
    pointsAgainst: 0,
    pointsFor: 0,
    position: teamIndex + 1,
    teamName:
      poolIndex === 0 && teamIndex === 3
        ? "-"
        : `Pool ${poolIndex + 1} Team ${teamIndex + 1}`,
    teamShortCode: `T${String(teamNumber).padStart(2, "0")}`,
    totalPoints: 0,
    triesFor: 0,
    won: 0,
  };
}

function buildPoolStandings(): PoolStanding[] {
  return ["Pool A", "Pool B", "Pool C", "Pool D", "Pool E", "Pool F"].map(
    (poolName, poolIndex) => ({
      poolName,
      standings: Array.from({ length: 4 }, (_, teamIndex) =>
        buildStanding(poolIndex, teamIndex),
      ),
    }),
  );
}

function buildMatch(
  index: number,
  status: MatchListItem["status"],
): MatchListItem {
  return {
    awayScore: null,
    awayTeam: {
      name: `Away ${index}`,
      shortCode: `A${index}`,
      slug: `away-${index}`,
    },
    homeScore: null,
    homeTeam: {
      name: `Home ${index}`,
      shortCode: `H${index}`,
      slug: `home-${index}`,
    },
    id: `rwc-match-${index}`,
    kickoffAt: `2027-10-${String((index % 28) + 1).padStart(2, "0")}T08:00:00.000Z`,
    poolName: `Pool ${String.fromCharCode(65 + (index % 6))}`,
    round: Math.floor(index / 6) + 1,
    roundName: null,
    status,
    venue: "Sydney",
  };
}

describe("RWC 2027 hub page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    competitionsMock.getCompetitionBySlug.mockResolvedValue(competition);
    competitionsMock.getCompetitionGuide.mockResolvedValue({
      guideJa: "日本での視聴方法は公式案内を確認してください。",
      sourceUrl: "https://www.rugbyworldcup.com/2027/en",
      verifiedAt: "2026-07-09T00:00:00.000Z",
    });
    standingsMock.getPoolStandingsForCompetition.mockResolvedValue(
      buildPoolStandings(),
    );
    contentStatusMock.getContentStatusMap.mockResolvedValue(
      new Map<string, MatchContentStatus>(),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("prioritizes the schedule and renders compact pool teams before the tournament starts", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue(
      Array.from({ length: 36 }, (_, index) =>
        buildMatch(index + 1, "scheduled"),
      ),
    );

    render(await RWC2027Page());

    expect(screen.queryByText("Coming Soon")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "ラグビーワールドカップ2027",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "2027年10〜11月、オーストラリア開催。全36試合のスケジュールが確定しています。開幕後、試合結果・日本語レビューを順次公開します。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pool A 順位表")).not.toBeInTheDocument();

    const schedule = screen.getByLabelText("RWC 2027 全日程");
    const poolGrid = screen.getByLabelText("RWC 2027 プール分け");

    expect(schedule).toHaveTextContent("全36試合の日程");
    expect(poolGrid).toHaveTextContent("Pool A");
    expect(poolGrid).toHaveTextContent("Pool 1 Team 1");
    expect(poolGrid).toHaveTextContent("未確定");
    expect(poolGrid).not.toHaveTextContent("-");
    expect(
      schedule.compareDocumentPosition(poolGrid) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(contentStatusMock.getContentStatusMap).toHaveBeenCalledWith(
      expect.arrayContaining(["rwc-match-1", "rwc-match-36"]),
    );
  });

  it("renders unique venues, the viewing guide, and FAQPage structured data", async () => {
    const matches = Array.from({ length: 36 }, (_, index) => {
      const match = buildMatch(index + 1, "scheduled");

      return index === 0
        ? {
            ...match,
            homeTeam: {
              ...match.homeTeam,
              name: "Japan",
              slug: "japan",
            },
            kickoffAt: "2027-10-01T08:00:00.000Z",
            venue: `Venue ${index % 8}`,
          }
        : { ...match, venue: `Venue ${index % 8}` };
    });
    matchesMock.listMatchesForCompetition.mockResolvedValue(matches);

    const { container } = render(await RWC2027Page());

    expect(
      screen.getByRole("heading", { name: "開催都市・会場" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Venue [0-7]$/)).toHaveLength(8);
    expect(
      screen.getByRole("heading", { name: "大会ガイド" }),
    ).toBeInTheDocument();
    expect(screen.getByText("最終確認日: 2026-07-09")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "参照元" })).toHaveAttribute(
      "href",
      "https://www.rugbyworldcup.com/2027/en",
    );

    const jsonLd = container.querySelector('script[type="application/ld+json"]');
    expect(jsonLd).not.toBeNull();
    expect(JSON.parse(jsonLd?.textContent ?? "")).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: expect.arrayContaining([
        expect.objectContaining({
          name: "ラグビーワールドカップ2027はいつ開催されますか？",
        }),
        expect.objectContaining({
          name: "ラグビーワールドカップ2027はどこで開催されますか？",
        }),
        expect.objectContaining({
          name: "ラグビーワールドカップ2027はどこで見られますか？",
        }),
        expect.objectContaining({
          acceptedAnswer: expect.objectContaining({
            text: expect.stringContaining("Japan 対 Away 1"),
          }),
          name: "日本代表の次の試合はいつですか（日本時間）？",
        }),
      ]),
    });
  });

  it("uses the Japan FAQ fallback when no future Japan fixture is available", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      buildMatch(1, "finished"),
    ]);

    const { container } = render(await RWC2027Page());
    const jsonLd = container.querySelector('script[type="application/ld+json"]');
    const structuredData = JSON.parse(jsonLd?.textContent ?? "") as {
      mainEntity: Array<{ acceptedAnswer: { text: string }; name: string }>;
    };

    expect(structuredData.mainEntity).toContainEqual(
      expect.objectContaining({
        acceptedAnswer: expect.objectContaining({
          text: "日本代表の次の試合は、対戦カードと日程の確定後にこのページでお知らせします。",
        }),
        name: "日本代表の次の試合はいつですか（日本時間）？",
      }),
    );
  });

  it("wraps the search-param client schedule in a suspense boundary", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      buildMatch(1, "scheduled"),
    ]);

    const page = await RWC2027Page();

    expect(containsSuspenseBoundary(page)).toBe(true);
  });

  it("keeps the pending state when there are no matches", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue([]);

    render(await RWC2027Page());

    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    expect(screen.getByText("Rugby World Cup 2027")).toBeInTheDocument();
    expect(screen.queryByLabelText("RWC 2027 全日程")).not.toBeInTheDocument();
    expect(contentStatusMock.getContentStatusMap).not.toHaveBeenCalled();
  });

  it("hides the pre-tournament banner after the tournament starts", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      buildMatch(1, "in_progress"),
      ...Array.from({ length: 35 }, (_, index) =>
        buildMatch(index + 2, "scheduled"),
      ),
    ]);

    render(await RWC2027Page());

    expect(
      screen.queryByText(/全36試合のスケジュールが確定しています/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("RWC 2027 プール分け")).not.toBeInTheDocument();
    expect(screen.getByText("Pool A 順位表")).toBeInTheDocument();

    const standingsHeading = screen.getByText("Pool A 順位表");
    const schedule = screen.getByLabelText("RWC 2027 全日程");

    expect(schedule).toHaveTextContent("全36試合の日程");
    expect(
      standingsHeading.compareDocumentPosition(schedule) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps real standings above the schedule after a match has finished", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      buildMatch(1, "finished"),
      ...Array.from({ length: 35 }, (_, index) =>
        buildMatch(index + 2, "scheduled"),
      ),
    ]);

    render(await RWC2027Page());

    expect(screen.queryByLabelText("RWC 2027 プール分け")).not.toBeInTheDocument();
    expect(screen.getByText("Pool A 順位表")).toBeInTheDocument();
    expect(screen.getByLabelText("RWC 2027 全日程")).toHaveTextContent(
      "全36試合の日程",
    );
  });
});
