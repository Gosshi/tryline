// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const matchContentMocks = vi.hoisted(() => ({
  getPublishedContentForMatch: vi.fn(),
}));

const matchEventMocks = vi.hoisted(() => ({
  getMatchEventsForMatch: vi.fn(),
}));

const matchLineupMocks = vi.hoisted(() => ({
  getMatchLineupsForMatch: vi.fn(),
}));

const standingsMocks = vi.hoisted(() => ({
  getStandingsForCompetition: vi.fn(),
}));

const authServerMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
}));

const authClientMocks = vi.hoisted(() => ({
  getClientUserState: vi.fn(),
}));

const sourcedFactMocks = vi.hoisted(() => ({
  getSourcedFactSummaryForMatch: vi.fn(),
}));

const sampleMatchMocks = vi.hoisted(() => ({
  isSampleMatch: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  countHeadToHeadMatches: vi.fn(),
  getMatchById: vi.fn(),
  getMatchContentEn: vi.fn(),
  getNextMatchesForTeams: vi.fn(),
  getPoolTeamsForMatch: vi.fn(),
  getRelatedPublishedRecapsForMatch: vi.fn(),
  listAllMatchIds: vi.fn(),
  listMatchIdsWithContent: vi.fn(),
  normalizeHeadToHeadSlug: vi.fn(() => "sample-home-vs-sample-away"),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

const premiumRecapMocks = vi.hoisted(() => ({
  PremiumRecapSection: vi.fn(
    ({
      content,
      hasLockedContent,
      nextLockedHeading,
    }: {
      content: { contentMdJa: string } | null;
      hasLockedContent: boolean;
      nextLockedHeading: string | null;
    }) => (
      <div data-testid="premium-recap-section">
        <span data-testid="premium-recap-content">
          {content?.contentMdJa ?? ""}
        </span>
        <span data-testid="premium-recap-has-locked">
          {String(hasLockedContent)}
        </span>
        <span data-testid="premium-recap-next-heading">
          {nextLockedHeading}
        </span>
      </div>
    ),
  ),
}));

vi.mock("@/components/lang-toggle", () => ({
  LangToggle: () => <div data-testid="lang-toggle" />,
}));

vi.mock("@/components/match-events-section", () => ({
  MatchEventsSection: () => <div data-testid="match-events" />,
}));

vi.mock("@/components/match-header", () => ({
  MatchHeader: ({ spoilerGuardEnabled }: { spoilerGuardEnabled?: boolean }) => (
    <div
      data-spoiler-guard-enabled={String(spoilerGuardEnabled ?? false)}
      data-testid="match-header"
    />
  ),
}));

vi.mock("@/components/match-lineups-section", () => ({
  MatchLineupsSection: () => <div data-testid="match-lineups" />,
}));

vi.mock("@/components/premium-match-chat", () => ({
  PremiumMatchChat: () => <div data-testid="premium-match-chat" />,
}));

vi.mock("@/components/premium-recap-section", () => premiumRecapMocks);

vi.mock("@/lib/auth/client", () => authClientMocks);
vi.mock("@/lib/auth/server", () => authServerMocks);
vi.mock("@/lib/db/queries/match-content", () => matchContentMocks);
vi.mock("@/lib/db/queries/match-events", () => matchEventMocks);
vi.mock("@/lib/db/queries/match-lineups", () => matchLineupMocks);
vi.mock("@/lib/db/queries/matches", () => matchMocks);
vi.mock("@/lib/db/queries/sourced-facts", () => sourcedFactMocks);
vi.mock("@/lib/db/queries/standings", () => standingsMocks);
vi.mock("@/lib/sample-matches", () => sampleMatchMocks);
vi.mock("next/navigation", () => navigationMocks);

import MatchEnglishPage from "@/app/matches/[id]/en/page";
import MatchDetailPage, { generateMetadata } from "@/app/matches/[id]/page";

import type { PublishedMatchContentBundle } from "@/lib/db/queries/match-content";
import type {
  EnglishMatchContentBundle,
  MatchDetail,
} from "@/lib/db/queries/matches";

const sampleMatchId = "a06219be-9d24-486b-92a5-7f9f88ef8826";
const nonSampleMatchId = "00000000-0000-0000-0000-000000000000";

const match: MatchDetail = {
  awayScore: 32,
  awayTeam: {
    englishName: "Sample Away",
    name: "サンプルアウェイ",
    shortCode: "AWY",
    slug: "sample-away",
  },
  awayTeamId: "away-team",
  broadcasts: [],
  competition: {
    family: "premiership",
    name: "Premiership Rugby",
    season: "2025-26",
    slug: "premiership-2025-26",
  },
  homeScore: 36,
  homeTeam: {
    englishName: "Sample Home",
    name: "サンプルホーム",
    shortCode: "HME",
    slug: "sample-home",
  },
  homeTeamId: "home-team",
  id: sampleMatchId,
  kickoffAt: "2026-05-30T14:00:00.000Z",
  poolName: null,
  round: 18,
  roundName: null,
  status: "finished",
  venue: "Sample Stadium",
};

const sampleRecap = {
  contentMdJa:
    "# この試合の核心\n\n無料で見える冒頭。\n\n# 試合全体像\n\n全体像。\n\n# ターニングポイント\n\nサンプル全文だけに含まれる終盤分析。\n\n# 次戦への示唆\n\n締め。",
  contentType: "recap" as const,
  generatedAt: "2026-05-30T18:00:00.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "recap@4.4.0",
};

const preview = {
  contentMdJa: "プレビュー本文",
  contentType: "preview" as const,
  generatedAt: "2026-05-29T18:00:00.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "preview@3.1.0",
};

function setCommonMocks(params: {
  englishContent?: EnglishMatchContentBundle;
  id?: string;
  match?: Partial<MatchDetail>;
  publishedContent?: PublishedMatchContentBundle;
}) {
  matchMocks.getMatchById.mockResolvedValue({
    ...match,
    id: params.id ?? sampleMatchId,
    ...params.match,
  });
  matchContentMocks.getPublishedContentForMatch.mockResolvedValue(
    params.publishedContent ?? {
      preview,
      recap: sampleRecap,
    },
  );
  matchMocks.getMatchContentEn.mockResolvedValue(
    params.englishContent ?? {
      preview: null,
      recap: null,
    },
  );
  matchEventMocks.getMatchEventsForMatch.mockResolvedValue([]);
  matchLineupMocks.getMatchLineupsForMatch.mockResolvedValue([]);
  sourcedFactMocks.getSourcedFactSummaryForMatch.mockResolvedValue({
    preview: 0,
    previewSources: [],
    recap: 0,
    recapSources: [],
  });
  standingsMocks.getStandingsForCompetition.mockResolvedValue([]);
  matchMocks.countHeadToHeadMatches.mockResolvedValue(0);
  matchMocks.getNextMatchesForTeams.mockResolvedValue([]);
  matchMocks.getRelatedPublishedRecapsForMatch.mockResolvedValue([]);
  matchMocks.getPoolTeamsForMatch.mockResolvedValue([]);
  authClientMocks.getClientUserState.mockResolvedValue({
    favoriteTeamSlugs: [],
    isPremium: false,
    spoilerGuardEnabled: false,
    user: null,
  });
  sampleMatchMocks.isSampleMatch.mockImplementation(
    async (matchId: string) => matchId === sampleMatchId,
  );
}

describe("match sample recap page", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setCommonMocks({});
  });

  it("server-renders the full sample recap without PremiumRecapSection", async () => {
    const element = await MatchDetailPage({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    const { container } = render(element);

    expect(container.querySelector("main > div")).toHaveClass("max-w-6xl");
    expect(screen.queryByText("試合開始前に通知します")).toBeNull();

    expect(
      screen.getByText("サンプル全文だけに含まれる終盤分析。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("これは無料サンプルのレビューです。"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("premium-recap-section")).toBeNull();
    const previewDetails = screen
      .getByText("試合前のプレビューを表示")
      .closest("details");
    expect(previewDetails).not.toHaveAttribute("open");
    expect(previewDetails).toHaveTextContent("プレビュー本文");
  });

  it("adds the disclosure to the recap trust strip but not the preview", async () => {
    setCommonMocks({
      match: {
        awayScore: 17,
        homeScore: 56,
      },
    });
    matchEventMocks.getMatchEventsForMatch.mockResolvedValue([
      {
        id: "event-1",
        isPenaltyTry: false,
        minute: 12,
        playerName: "Home Scorer",
        points: null,
        teamId: "home-team",
        type: "try",
      },
    ]);

    const element = await MatchDetailPage({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    render(element);

    expect(
      screen.getAllByText(
        "この記事の得点経過は現在の記録と一致していません。確認のうえ更新します。",
      ),
    ).toHaveLength(1);
  });

  it("does not disclose a recap when event totals match the final score", async () => {
    setCommonMocks({
      match: {
        awayScore: 0,
        homeScore: 5,
      },
    });
    matchEventMocks.getMatchEventsForMatch.mockResolvedValue([
      {
        id: "event-1",
        isPenaltyTry: false,
        minute: 12,
        playerName: "Home Scorer",
        points: null,
        teamId: "home-team",
        type: "try",
      },
    ]);

    const element = await MatchDetailPage({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    render(element);

    expect(
      screen.queryByText(
        "この記事の得点経過は現在の記録と一致していません。確認のうえ更新します。",
      ),
    ).toBeNull();
  });

  it.each([
    {
      events: [
        {
          id: "event-1",
          isPenaltyTry: false,
          minute: 12,
          playerName: "Home Scorer",
          points: null,
          teamId: "home-team",
          type: "try",
        },
      ],
      match: { awayScore: 17, homeScore: 56, status: "scheduled" as const },
      name: "the match is not finished",
    },
    {
      events: [
        {
          id: "event-1",
          isPenaltyTry: false,
          minute: 12,
          playerName: "Home Scorer",
          points: null,
          teamId: "home-team",
          type: "try",
        },
      ],
      match: { awayScore: 17, homeScore: null },
      name: "a final score is unavailable",
    },
    {
      events: [],
      match: { awayScore: 17, homeScore: 56 },
      name: "there are no events",
    },
  ])("does not disclose a recap when $name", async ({ events, match }) => {
    setCommonMocks({ match });
    matchEventMocks.getMatchEventsForMatch.mockResolvedValue(events);

    const element = await MatchDetailPage({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    render(element);

    expect(
      screen.queryByText(
        "この記事の得点経過は現在の記録と一致していません。確認のうえ更新します。",
      ),
    ).toBeNull();
  });

  it("keeps non-sample recaps on the existing premium gate", async () => {
    setCommonMocks({ id: nonSampleMatchId });

    const element = await MatchDetailPage({
      params: Promise.resolve({ id: nonSampleMatchId }),
    });

    render(element);

    expect(screen.getByTestId("premium-recap-section")).toBeInTheDocument();
    expect(screen.getByTestId("premium-recap-has-locked")).toHaveTextContent(
      "true",
    );
    expect(screen.getByTestId("premium-recap-next-heading")).toHaveTextContent(
      "ターニングポイント",
    );
    expect(screen.getByTestId("premium-recap-content")).toHaveTextContent(
      "無料で見える冒頭。",
    );
    expect(screen.getByTestId("premium-recap-content")).toHaveTextContent(
      "全体像。",
    );
    expect(
      screen.queryByText("サンプル全文だけに含まれる終盤分析。"),
    ).toBeNull();
    expect(screen.getByTestId("premium-recap-content")).not.toHaveTextContent(
      "サンプル全文だけに含まれる終盤分析。",
    );
    expect(
      screen.getByRole("heading", { name: "次に見る" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "このチームを追う" }),
    ).toHaveLength(2);
    const previewDetails = screen
      .getByText("試合前のプレビューを表示")
      .closest("details");
    expect(previewDetails).toHaveTextContent("プレビュー本文");
  });

  it("uses client user state for spoiler guard and favorite team controls", async () => {
    authClientMocks.getClientUserState.mockResolvedValue({
      favoriteTeamSlugs: ["sample-away"],
      isPremium: false,
      spoilerGuardEnabled: true,
      user: { id: "user-1" },
    });

    const element = await MatchDetailPage({
      params: Promise.resolve({ id: nonSampleMatchId }),
    });

    render(element);

    await waitFor(() => {
      expect(screen.getByTestId("match-header")).toHaveAttribute(
        "data-spoiler-guard-enabled",
        "true",
      );
      expect(
        screen.getAllByRole("button", { name: "サンプルホームを追う" }),
      ).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "応援中" })).toHaveLength(2);
      expect(
        screen.queryByRole("link", { name: "このチームを追う" }),
      ).not.toBeInTheDocument();
    });
    expect(authServerMocks.getUser).not.toHaveBeenCalled();
    expect(authServerMocks.getUserProfile).not.toHaveBeenCalled();
  });

  it("renders next matches and related recaps before lineups and chat", async () => {
    matchMocks.getNextMatchesForTeams.mockResolvedValue([
      {
        match: {
          ...match,
          awayScore: null,
          awayTeam: {
            name: "次戦アウェイ",
            shortCode: "NXT",
            slug: "next-away",
          },
          homeScore: null,
          homeTeam: {
            name: "サンプルホーム",
            shortCode: "HME",
            slug: "sample-home",
          },
          id: "next-home-match",
          kickoffAt: "2026-06-06T10:00:00.000Z",
          status: "scheduled",
        },
        teamId: "home-team",
      },
    ]);
    matchMocks.getRelatedPublishedRecapsForMatch.mockResolvedValue([
      {
        ...match,
        awayTeam: {
          name: "関連アウェイ",
          shortCode: "REL",
          slug: "related-away",
        },
        homeTeam: {
          name: "関連ホーム",
          shortCode: "REL",
          slug: "related-home",
        },
        id: "related-recap",
        recapExcerpt: "関連レビュー",
        recapGeneratedAt: "2026-05-31T10:00:00.000Z",
      },
    ]);

    const element = await MatchDetailPage({
      params: Promise.resolve({ id: nonSampleMatchId }),
    });

    render(element);

    expect(matchMocks.getNextMatchesForTeams).toHaveBeenCalledWith({
      afterIso: match.kickoffAt,
      excludeMatchId: nonSampleMatchId,
      teamIds: ["home-team", "away-team"],
    });
    expect(matchMocks.getRelatedPublishedRecapsForMatch).toHaveBeenCalledWith({
      competitionSlug: "premiership-2025-26",
      excludeMatchId: nonSampleMatchId,
      round: 18,
    });
    expect(
      screen.getByRole("link", { name: "サンプルホーム 対 次戦アウェイ" }),
    ).toHaveAttribute("href", "/matches/next-home-match");
    expect(
      screen.getByRole("link", { name: /関連ホーム 対 関連アウェイ/ }),
    ).toHaveAttribute("href", "/matches/related-recap");
    expect(
      screen.getByRole("link", { name: "今週の全試合を見る" }),
    ).toHaveAttribute("href", "/calendar");
    const nextWatchHeading = screen.getByRole("heading", { name: "次に見る" });
    const mainContent = nextWatchHeading.closest("main");

    expect(mainContent).toBeInTheDocument();
    expect(
      mainContent?.querySelector('[data-testid="match-lineups"]'),
    ).not.toBeNull();
    expect(
      mainContent?.querySelector('[data-testid="premium-match-chat"]'),
    ).not.toBeNull();
    expect(
      nextWatchHeading.compareDocumentPosition(
        mainContent?.querySelector('[data-testid="match-lineups"]')!,
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      nextWatchHeading.compareDocumentPosition(
        mainContent?.querySelector('[data-testid="premium-match-chat"]')!,
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("server-renders English sample recaps when English content exists", async () => {
    setCommonMocks({
      englishContent: {
        preview: null,
        recap: {
          ...sampleRecap,
          contentMdJa:
            "# Core question\n\nOpening.\n\n# Match shape\n\nMiddle.\n\n# Turning point\n\nEnglish full sample section.\n\n# What next\n\nClose.",
        },
      },
    });

    const element = await MatchEnglishPage({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    render(element);

    expect(
      screen.getByText("English full sample section."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This full review is a free sample."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("premium-recap-section")).toBeNull();
  });

  it("shows RWC 2027 pool teams for scheduled pool matches", async () => {
    setCommonMocks({
      match: {
        awayScore: null,
        awayTeam: {
          englishName: "Portugal",
          name: "ポルトガル",
          shortCode: "POR",
          slug: "portugal",
        },
        competition: {
          family: "rwc",
          name: "Rugby World Cup 2027",
          season: "2027",
          slug: "rwc-2027",
        },
        homeScore: null,
        homeTeam: {
          englishName: "Scotland",
          name: "スコットランド",
          shortCode: "SCO",
          slug: "scotland",
        },
        poolName: "Pool D",
        status: "scheduled",
      },
      publishedContent: {
        preview: null,
        recap: null,
      },
    });
    matchMocks.getPoolTeamsForMatch.mockResolvedValue([
      { name: "スコットランド", nameJa: "スコットランド", slug: "scotland" },
      { name: "アイルランド", nameJa: "アイルランド", slug: "ireland" },
      { name: "ウルグアイ", nameJa: "ウルグアイ", slug: "uruguay" },
      { name: "ポルトガル", nameJa: "ポルトガル", slug: "portugal" },
    ]);

    const element = await MatchDetailPage({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    render(element);

    expect(
      screen.getByRole("heading", { name: "Pool D 参加チーム" }),
    ).toBeInTheDocument();
    for (const teamName of [
      "スコットランド",
      "アイルランド",
      "ウルグアイ",
      "ポルトガル",
    ]) {
      expect(screen.getByRole("link", { name: teamName })).toBeInTheDocument();
    }
  });

  it("adds pool context to metadata description for empty scheduled RWC matches", async () => {
    setCommonMocks({
      match: {
        awayScore: null,
        awayTeam: {
          englishName: "Portugal",
          name: "ポルトガル",
          shortCode: "POR",
          slug: "portugal",
        },
        competition: {
          family: "rwc",
          name: "Rugby World Cup 2027",
          nameJa: "ラグビーワールドカップ",
          season: "2027",
          slug: "rwc-2027",
        },
        homeScore: null,
        homeTeam: {
          englishName: "Scotland",
          name: "スコットランド",
          shortCode: "SCO",
          slug: "scotland",
        },
        poolName: "Pool D",
        status: "scheduled",
      },
      publishedContent: {
        preview: null,
        recap: null,
      },
    });
    matchMocks.getPoolTeamsForMatch.mockResolvedValue([
      { name: "スコットランド", nameJa: "スコットランド", slug: "scotland" },
      { name: "アイルランド", nameJa: "アイルランド", slug: "ireland" },
      { name: "ウルグアイ", nameJa: "ウルグアイ", slug: "uruguay" },
      { name: "ポルトガル", nameJa: "ポルトガル", slug: "portugal" },
    ]);

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    expect(metadata.title).toBe(
      "スコットランド 対 ポルトガル — ラグビーワールドカップ 2027",
    );
    expect(metadata.description).toContain("Rugby World Cup 2027 Pool D");
    expect(metadata.description).toContain("スコットランド");
    expect(metadata.description).toContain("ポルトガル");
    expect(String(metadata.description)).not.toContain("vs");
  });

  it("uses the Japanese family name in metadata when name_ja is null", async () => {
    setCommonMocks({
      match: {
        competition: {
          family: "premiership",
          name: "Premiership Rugby",
          nameJa: null,
          season: "2025-26",
          slug: "premiership-2025-26",
        },
      },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    expect(metadata.title).toBe(
      "サンプルホーム 対 サンプルアウェイ — プレミアシップ 2025-26",
    );
  });

  it("falls back to the English competition name when name_ja and the family map are absent", async () => {
    setCommonMocks({
      match: {
        competition: {
          family: "greatest-rivalry",
          name: "Greatest Rivalry 2026",
          nameJa: null,
          season: "2026",
          slug: "greatest-rivalry-2026",
        },
      },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    expect(metadata.title).toBe(
      "サンプルホーム 対 サンプルアウェイ — Greatest Rivalry 2026",
    );
  });

  it("marks thin future match pages as noindex when content is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T00:00:00.000Z"));
    setCommonMocks({
      match: {
        awayScore: null,
        homeScore: null,
        kickoffAt: "2027-10-01T10:00:00.000Z",
        status: "scheduled",
      },
      publishedContent: {
        preview: null,
        recap: null,
      },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: sampleMatchId }),
    });

    expect(metadata.robots).toEqual({ follow: true, index: false });
    vi.useRealTimers();
  });

  it("keeps near-term or content-backed match pages indexable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T00:00:00.000Z"));
    setCommonMocks({
      match: {
        awayScore: null,
        homeScore: null,
        kickoffAt: "2026-07-12T10:00:00.000Z",
        status: "scheduled",
      },
      publishedContent: {
        preview: null,
        recap: null,
      },
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({ id: sampleMatchId }),
      }),
    ).resolves.not.toHaveProperty("robots");

    setCommonMocks({
      match: {
        awayScore: null,
        homeScore: null,
        kickoffAt: "2027-10-01T10:00:00.000Z",
        status: "scheduled",
      },
      publishedContent: {
        preview,
        recap: null,
      },
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({ id: sampleMatchId }),
      }),
    ).resolves.not.toHaveProperty("robots");
    vi.useRealTimers();
  });
});
