// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
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

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
}));

const spoilerGuardMocks = vi.hoisted(() => ({
  getSpoilerGuardEnabledForUser: vi.fn(),
}));

const sourcedFactMocks = vi.hoisted(() => ({
  getSourcedFactCountsForMatch: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  countHeadToHeadMatches: vi.fn(),
  getMatchById: vi.fn(),
  getMatchContentEn: vi.fn(),
  getPoolTeamsForMatch: vi.fn(),
  listAllMatchIds: vi.fn(),
  listMatchIdsWithContent: vi.fn(),
  normalizeHeadToHeadSlug: vi.fn(() => "sample-home-vs-sample-away"),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
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
  MatchHeader: () => <div data-testid="match-header" />,
}));

vi.mock("@/components/match-lineups-section", () => ({
  MatchLineupsSection: () => <div data-testid="match-lineups" />,
}));

vi.mock("@/components/premium-match-chat", () => ({
  PremiumMatchChat: () => <div data-testid="premium-match-chat" />,
}));

vi.mock("@/components/premium-recap-section", () => premiumRecapMocks);

vi.mock("@/lib/auth/server", () => authMocks);
vi.mock("@/lib/db/queries/match-content", () => matchContentMocks);
vi.mock("@/lib/db/queries/match-events", () => matchEventMocks);
vi.mock("@/lib/db/queries/match-lineups", () => matchLineupMocks);
vi.mock("@/lib/db/queries/matches", () => matchMocks);
vi.mock("@/lib/db/queries/spoiler-guard", () => spoilerGuardMocks);
vi.mock("@/lib/db/queries/sourced-facts", () => sourcedFactMocks);
vi.mock("@/lib/db/queries/standings", () => standingsMocks);
vi.mock("next/navigation", () => navigationMocks);

import MatchEnglishPage from "@/app/matches/[id]/en/page";
import MatchDetailPage, {
  generateMetadata,
} from "@/app/matches/[id]/page";

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
  sourcedFactMocks.getSourcedFactCountsForMatch.mockResolvedValue({
    preview: 0,
    recap: 0,
  });
  standingsMocks.getStandingsForCompetition.mockResolvedValue([]);
  matchMocks.countHeadToHeadMatches.mockResolvedValue(0);
  matchMocks.getPoolTeamsForMatch.mockResolvedValue([]);
  authMocks.getUser.mockResolvedValue(null);
  authMocks.getUserProfile.mockResolvedValue(null);
  spoilerGuardMocks.getSpoilerGuardEnabledForUser.mockResolvedValue(false);
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

    render(element);

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
    const previewDetails = screen
      .getByText("試合前のプレビューを表示")
      .closest("details");
    expect(previewDetails).toHaveTextContent("プレビュー本文");
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
