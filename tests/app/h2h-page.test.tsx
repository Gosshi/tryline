// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HeadToHeadPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/h2h/[pair]/page";
import { writeSpoilerGuard } from "@/lib/spoiler-guard";

const authMock = vi.hoisted(() => ({ getClientUserState: vi.fn() }));
vi.mock("@/lib/auth/client", () => authMock);

const broadcastMocks = vi.hoisted(() => ({
  getMatchBroadcastsForMatches: vi.fn(),
}));
vi.mock("@/lib/db/queries/match-broadcasts", () => broadcastMocks);

// React.cache is request-scoped in RSC; model that scope explicitly in this jsdom suite.
const requestCache = vi.hoisted(() => ({
  stores: [] as Map<unknown, unknown>[],
  calls: [] as unknown[][],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: (fn: (...args: unknown[]) => unknown) => {
    const store = new Map<unknown, unknown>();
    requestCache.stores.push(store);
    return (...args: unknown[]) => {
      requestCache.calls.push(args);
      if (!store.has(args[0])) store.set(args[0], fn(...args));
      return store.get(args[0]);
    };
  },
}));

const contentMocks = vi.hoisted(() => ({
  getContentStatusForMatches: vi.fn(),
}));

const trackedLinkMocks = vi.hoisted(() => ({
  calls: [] as Array<{ analytics: { cta_id: string; match_id?: string } }>,
}));

const matchesMock = vi.hoisted(() => ({
  getHeadToHeadPageData: vi.fn(),
  listHeadToHeadPairs: vi.fn(),
  normalizeHeadToHeadSlug: vi.fn((teamSlugA: string, teamSlugB: string) =>
    [teamSlugA, teamSlugB].sort().join("-vs-"),
  ),
  summarizeHeadToHeadRecord: vi.fn(
    (
      history: Array<{
        playedOn: string;
        teamSlug: string;
        teamScore: number;
        opponentScore: number;
      }>,
      matches: Array<{
        status: string;
        kickoffAt: string;
        homeTeam: { slug: string };
        homeScore: number | null;
        awayScore: number | null;
      }>,
      teamA: { slug: string },
    ) => {
      const records = history.map((row) =>
        row.teamSlug === teamA.slug
          ? ([row.teamScore, row.opponentScore] as const)
          : ([row.opponentScore, row.teamScore] as const),
      );
      for (const match of matches)
        if (
          match.status === "finished" &&
          match.homeScore !== null &&
          match.awayScore !== null
        )
          records.push([
            match.homeTeam.slug === teamA.slug
              ? match.homeScore
              : match.awayScore,
            match.homeTeam.slug === teamA.slug
              ? match.awayScore
              : match.homeScore,
          ]);
      const wins = records.filter(([a, b]) => a > b).length;
      const losses = records.filter(([a, b]) => a < b).length;
      return {
        total: records.length,
        wins,
        losses,
        draws: records.length - wins - losses,
        firstPlayedOn:
          [
            ...history.map((row) => row.playedOn),
            ...matches.map((row) => row.kickoffAt.slice(0, 10)),
          ].sort()[0] ?? null,
      };
    },
  ),
  parseHeadToHeadSlug: vi.fn((pair: string) => {
    const parts = pair.split("-vs-");

    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) {
      return null;
    }

    return { teamSlugA: parts[0], teamSlugB: parts[1] };
  }),
}));

const navigationMock = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/match-content", () => contentMocks);
vi.mock("@/components/tracked-link", () => ({
  TrackedLink: ({
    analytics,
    children,
    href,
  }: {
    analytics: { cta_id: string; match_id?: string };
    children: ReactNode;
    href: string;
  }) => {
    trackedLinkMocks.calls.push({ analytics });

    return <a href={href}>{children}</a>;
  },
}));
vi.mock("next/navigation", () => navigationMock);

import type { MatchBroadcast } from "@/lib/db/queries/match-broadcasts";
import type { ReactNode } from "react";

const pageData = {
  canonicalSlug: "leinster-vs-toulouse",
  history: [],
  historyFetchedAt: null,
  matches: [
    {
      awayScore: 20,
      awayTeam: {
        name: "Stade Toulousain",
        shortCode: "TLS",
        slug: "toulouse",
      },
      competition: {
        name: "Investec Champions Cup",
        season: "2025",
        slug: "champions-cup-2025",
      },
      homeScore: 27,
      homeTeam: { name: "Leinster", shortCode: "LEI", slug: "leinster" },
      id: "match-1",
      kickoffAt: "2025-05-24T13:45:00.000Z",
      round: null,
      roundName: "Final",
      status: "finished",
      venue: "Cardiff",
    },
  ],
  teamA: { name: "Leinster", shortCode: "LEI", slug: "leinster" },
  teamB: { name: "Stade Toulousain", shortCode: "TLS", slug: "toulouse" },
};

describe("H2H page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestCache.stores.forEach((store) => store.clear());
    requestCache.calls.length = 0;
    broadcastMocks.getMatchBroadcastsForMatches.mockResolvedValue(new Map());
    authMock.getClientUserState.mockResolvedValue({
      favoriteTeamSlugs: [],
      isPremium: false,
      spoilerGuardEnabled: false,
      user: null,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00.000Z"));
    contentMocks.getContentStatusForMatches.mockResolvedValue({});
    trackedLinkMocks.calls.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const nextMatch = {
    ...pageData.matches[0],
    id: "scotland-japan-next",
    kickoffAt: "2026-11-21T14:10:00.000Z",
    status: "scheduled",
    homeScore: null as number | null,
    awayScore: null as number | null,
  };
  const broadcasts: MatchBroadcast[] = [
    {
      displayOrder: 1,
      kind: "tv",
      serviceName: "WOWOWプライム",
      url: "https://example.test/wowow",
      sourceUrl: null,
      verifiedAt: "2026-11-14T15:10:00Z",
    },
    {
      displayOrder: 2,
      kind: "tv",
      serviceName: "J SPORTS 1",
      url: "https://example.test/jsports",
      sourceUrl: null,
      verifiedAt: "2026-11-14T12:00:00Z",
    },
    {
      displayOrder: 3,
      kind: "streaming",
      serviceName: "WOWOWオンデマンド",
      url: "https://example.test/wowow-ondemand",
      sourceUrl: null,
      verifiedAt: "2026-11-14T12:00:00Z",
    },
    {
      displayOrder: 4,
      kind: "streaming",
      serviceName: "J SPORTSオンデマンド",
      url: "",
      sourceUrl: null,
      verifiedAt: "2026-11-14T12:00:00Z",
    },
  ];
  const baseDescription =
    "ラグビー日本とスコットランドの通算対戦成績（1試合 1勝0敗）。過去の全対戦のスコアと、直近の日本語レビューへのリンク。";
  const metadataTitle = {
    absolute: "ラグビー 日本 対 スコットランド 対戦成績 | Tryline",
  };
  const params = () => ({
    params: Promise.resolve({ pair: "japan-vs-scotland" }),
  });
  function arrangeNextMatch(
    overrides: Partial<typeof nextMatch> & { kickoffTimeTbd?: boolean } = {},
  ) {
    vi.setSystemTime(new Date("2026-11-14T14:10:00.000Z"));
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      canonicalSlug: "japan-vs-scotland",
      teamA: { name: "日本", shortCode: "JPN", slug: "japan" },
      teamB: { name: "スコットランド", shortCode: "SCO", slug: "scotland" },
      matches: [{ ...nextMatch, ...overrides }],
      history: [
        {
          playedOn: "1973-09-24",
          teamSlug: "japan",
          opponentSlug: "scotland",
          teamScore: 10,
          opponentScore: 7,
          venue: null,
          competitionLabel: null,
        },
      ],
    });
    // Deliberately unsorted to exercise the display_order contract in both surfaces.
    broadcastMocks.getMatchBroadcastsForMatches.mockResolvedValue(
      new Map([
        [
          nextMatch.id,
          [broadcasts[3], broadcasts[1], broadcasts[0], broadcasts[2]],
        ],
      ]),
    );
  }
  async function renderNextMatch() {
    render(await HeadToHeadPage(params()));
    return within(screen.getByText("次回対戦").closest("aside")!);
  }

  it("shows all four broadcasts in display order, with kind labels, safe links and JST verification date", async () => {
    arrangeNextMatch();
    const card = await renderNextMatch();
    const items = card.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.textContent)).toEqual([
      "放送WOWOWプライム ↗",
      "放送J SPORTS 1 ↗",
      "配信WOWOWオンデマンド ↗",
      "配信J SPORTSオンデマンド",
    ]);
    for (const broadcast of broadcasts.slice(0, 3)) {
      const link = card.getByRole("link", { name: broadcast.serviceName });
      expect(link).toHaveAttribute("href", broadcast.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(
      card.queryByRole("link", { name: "J SPORTSオンデマンド" }),
    ).not.toBeInTheDocument();
    expect(card.getByText("確認日: 11/15")).toBeInTheDocument();
    expect(
      broadcastMocks.getMatchBroadcastsForMatches,
    ).toHaveBeenCalledExactlyOnceWith([nextMatch.id]);
  });

  it("omits broadcasts and verification date without claiming that viewing is unannounced", async () => {
    arrangeNextMatch();
    broadcastMocks.getMatchBroadcastsForMatches.mockResolvedValue(new Map());
    const card = await renderNextMatch();
    expect(
      card.queryByRole("list", { name: "放送・配信" }),
    ).not.toBeInTheDocument();
    expect(card.queryByText(/確認日|未定|未発表/)).not.toBeInTheDocument();
    expect(card.getByText("日本 対 スコットランド")).toBeInTheDocument();
  });

  it("keeps the card and metadata when broadcasts fail and logs once for the request", async () => {
    arrangeNextMatch();
    broadcastMocks.getMatchBroadcastsForMatches.mockRejectedValue(
      new Error("offline"),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const metadata = await generateMetadata(params());
      const card = await renderNextMatch();
      expect(card.getByText("日本 対 スコットランド")).toBeInTheDocument();
      expect(card.getByText("2026-11-21 (土) 23:10 JST")).toBeInTheDocument();
      expect(card.queryByRole("list")).not.toBeInTheDocument();
      expect(metadata.description).toBe(
        "次戦は11月21日(土)23:10 JST キックオフ。" + baseDescription,
      );
      expect(error).toHaveBeenCalledExactlyOnceWith(
        `[h2h] Failed to load broadcasts for match ${nextMatch.id}`,
      );
    } finally {
      error.mockRestore();
    }
  });

  it.each([true, false])(
    "shows the preview link only with hasPreview=%s and preserves the existing CTA",
    async (hasPreview) => {
      arrangeNextMatch();
      contentMocks.getContentStatusForMatches.mockResolvedValue({
        [nextMatch.id]: { hasPreview, hasRecap: false },
      });
      const card = await renderNextMatch();
      const preview = card.queryByRole("link", { name: "プレビューを読む →" });
      if (hasPreview) {
        expect(preview).toHaveAttribute("href", `/matches/${nextMatch.id}`);
        expect(trackedLinkMocks.calls).toContainEqual(
          expect.objectContaining({
            analytics: expect.objectContaining({
              cta_id: "h2h_next_match_preview",
              match_id: nextMatch.id,
            }),
          }),
        );
      } else {
        expect(preview).not.toBeInTheDocument();
        expect(
          trackedLinkMocks.calls.some(
            ({ analytics }) => analytics.cta_id === "h2h_next_match_preview",
          ),
        ).toBe(false);
      }
      expect(
        card.getByRole("link", { name: "次回対戦の詳細を見る →" }),
      ).toHaveAttribute("href", `/matches/${nextMatch.id}`);
      expect(trackedLinkMocks.calls).toContainEqual(
        expect.objectContaining({
          analytics: expect.objectContaining({
            cta_id: "h2h_next_match",
            match_id: nextMatch.id,
          }),
        }),
      );
    },
  );

  it("does not query broadcasts without a future scheduled match in either surface", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue(pageData);
    await generateMetadata({
      params: Promise.resolve({ pair: pageData.canonicalSlug }),
    });
    render(
      await HeadToHeadPage({
        params: Promise.resolve({ pair: pageData.canonicalSlug }),
      }),
    );
    expect(broadcastMocks.getMatchBroadcastsForMatches).not.toHaveBeenCalled();
  });

  it("prefixes metadata seven days ahead with the first three ordered services and reuses broadcasts across surfaces", async () => {
    arrangeNextMatch();
    const metadata = await generateMetadata(params());
    const description =
      "次戦は11月21日(土)23:10 JST キックオフ、WOWOWプライム・J SPORTS 1・WOWOWオンデマンドなどで放送・配信。" +
      baseDescription;
    expect(metadata).toMatchObject({
      title: metadataTitle,
      description,
      openGraph: { description },
    });
    await renderNextMatch();
    expect(
      broadcastMocks.getMatchBroadcastsForMatches,
    ).toHaveBeenCalledExactlyOnceWith([nextMatch.id]);
    expect(requestCache.calls).toEqual([[nextMatch.id], [nextMatch.id]]);
  });

  it("leaves description unchanged fifteen days ahead while preserving title", async () => {
    arrangeNextMatch({ kickoffAt: "2026-11-29T14:10:00.000Z" });
    expect(await generateMetadata(params())).toMatchObject({
      title: metadataTitle,
      description: baseDescription,
      openGraph: { description: baseDescription },
    });
    expect(broadcastMocks.getMatchBroadcastsForMatches).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-11-28T14:10:00.000Z", true],
    ["2026-11-28T14:10:00.001Z", false],
  ] as const)(
    "handles the exact fourteen-day boundary at %s (included=%s)",
    async (kickoffAt, included) => {
      arrangeNextMatch({ kickoffAt });
      const metadata = await generateMetadata(params());
      const description = included
        ? "次戦は11月28日(土)23:10 JST キックオフ、WOWOWプライム・J SPORTS 1・WOWOWオンデマンドなどで放送・配信。" +
          baseDescription
        : baseDescription;
      expect(metadata).toMatchObject({
        title: metadataTitle,
        description,
        openGraph: { description },
      });
    },
  );

  it("omits the time and kickoff wording when the kickoff time is TBD", async () => {
    arrangeNextMatch({ kickoffTimeTbd: true });
    const metadata = await generateMetadata(params());
    const description =
      "次戦は11月21日(土)、WOWOWプライム・J SPORTS 1・WOWOWオンデマンドなどで放送・配信。" +
      baseDescription;
    expect(metadata).toMatchObject({
      title: metadataTitle,
      description,
      openGraph: { description },
    });
    expect(metadata.description).not.toContain("キックオフ");
    expect(metadata.description).not.toContain("23:10");
  });

  it("omits viewing claims for metadata without broadcasts, including a date-only TBD kickoff", async () => {
    arrangeNextMatch();
    broadcastMocks.getMatchBroadcastsForMatches.mockResolvedValue(new Map());
    expect(await generateMetadata(params())).toMatchObject({
      title: metadataTitle,
      description: "次戦は11月21日(土)23:10 JST キックオフ。" + baseDescription,
    });
    requestCache.stores.forEach((store) => store.clear());
    arrangeNextMatch({ kickoffTimeTbd: true });
    broadcastMocks.getMatchBroadcastsForMatches.mockResolvedValue(new Map());
    const metadata = await generateMetadata(params());
    expect(metadata).toMatchObject({
      title: metadataTitle,
      description: "次戦は11月21日(土)。" + baseDescription,
    });
    expect(metadata.description).not.toContain("放送・配信");
  });

  it("removes the next-match metadata prefix after kickoff or a status change", async () => {
    arrangeNextMatch({ kickoffAt: "2026-11-14T14:09:59.999Z" });
    expect((await generateMetadata(params())).description).toBe(
      baseDescription,
    );
    arrangeNextMatch({ status: "finished", homeScore: 24, awayScore: 17 });
    expect((await generateMetadata(params())).description).toBe(
      baseDescription.replace("1試合 1勝0敗", "2試合 1勝1敗"),
    );
    expect(broadcastMocks.getMatchBroadcastsForMatches).not.toHaveBeenCalled();
  });

  it("hides individual results in the hero CTA, stored matches and history while retaining links", async () => {
    writeSpoilerGuard(true);
    authMock.getClientUserState.mockResolvedValue({
      favoriteTeamSlugs: [],
      isPremium: false,
      spoilerGuardEnabled: true,
      user: null,
    });
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      history: [
        {
          playedOn: "2000-01-01",
          teamSlug: "japan",
          teamScore: 31,
          opponentScore: 19,
          venue: null,
          competitionLabel: null,
        },
      ],
    });
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasRecap: true },
    });
    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    let container!: HTMLElement;
    await act(async () => {
      container = render(element).container;
    });
    expect(screen.getAllByText("27 - 20")[0]).not.toBeVisible();
    expect(screen.getByText("31 - 19")).not.toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "タップして結果を見る" }),
    ).toHaveLength(3);
    expect(container.querySelector('a[href="/matches/match-1"]')).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "タップして結果を見る" })[0]!,
    );
    expect(container.textContent).toContain("27 - 20");
    expect(
      screen.getAllByRole("button", { name: "タップして結果を見る" }),
    ).toHaveLength(2);
  });

  it("generates static params from real stored pairs", async () => {
    matchesMock.listHeadToHeadPairs.mockResolvedValue([
      { slug: "leinster-vs-toulouse" },
    ]);

    await expect(generateStaticParams()).resolves.toEqual([
      { pair: "leinster-vs-toulouse" },
    ]);
  });

  it("renders Tryline-scoped H2H match links", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue(pageData);
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasPreview: false, hasRecap: true },
    });

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    const { container } = render(element);

    expect(
      screen.getByRole("heading", {
        name: "Leinster 対 Stade Toulousain 対戦成績",
      }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain("Leinster 対 Stade Toulousain");
    expect(container.textContent).not.toContain("Leinster vs Stade Toulousain");
    expect(screen.getAllByText(/Tryline 収録分/).length).toBeGreaterThan(0);
    expect(screen.queryByText("最新の対戦")).not.toBeInTheDocument();
    expect(screen.getByText("直近の対戦")).toBeInTheDocument();
    expect(container.querySelector('a[href="/matches/match-1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/teams/leinster"]')).toBeTruthy();
    expect(container.querySelector('a[href="/teams/toulouse"]')).toBeTruthy();
    expect(container.textContent?.includes('"@type":"BreadcrumbList"')).toBe(
      true,
    );
    expect(container.textContent).not.toContain("勝");
    expect(
      screen.getByRole("link", { name: "直近の対戦のレビューを読む →" }),
    ).toHaveAttribute("href", "/matches/match-1");
    expect(contentMocks.getContentStatusForMatches).toHaveBeenCalledWith([
      "match-1",
    ]);
    expect(trackedLinkMocks.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          analytics: expect.objectContaining({
            cta_id: "h2h_latest_review",
            match_id: "match-1",
          }),
        }),
      ]),
    );
  });

  it("shows the nearest future meeting with a tracked match link", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      matches: [
        {
          ...pageData.matches[0],
          id: "next-later-match",
          kickoffAt: "2026-08-07T23:00:00.000Z",
          status: "scheduled",
        },
        {
          ...pageData.matches[0],
          id: "next-match",
          kickoffAt: "2026-08-08T00:30:00.000+02:00",
          status: "scheduled",
        },
        pageData.matches[0],
      ],
    });
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasPreview: false, hasRecap: false },
    });

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    render(element);

    expect(screen.getByText("次回対戦")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "次回対戦の詳細を見る →" }),
    ).toHaveAttribute("href", "/matches/next-match");
    expect(
      screen.queryByRole("link", { name: "直近の対戦のレビューを読む →" }),
    ).not.toBeInTheDocument();
    expect(trackedLinkMocks.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          analytics: expect.objectContaining({
            cta_id: "h2h_next_match",
            match_id: "next-match",
          }),
        }),
      ]),
    );
  });

  it("does not render the most recent meeting when no finished match exists", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      matches: [
        {
          ...pageData.matches[0],
          id: "scheduled-match",
          kickoffAt: "2026-08-08T13:45:00.000Z",
          status: "scheduled",
        },
      ],
    });

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    render(element);

    expect(screen.queryByText("直近の対戦")).not.toBeInTheDocument();
    expect(screen.getByText("次回対戦")).toBeInTheDocument();
  });

  it("does not render the next meeting when no future scheduled match exists", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      matches: [
        pageData.matches[0],
        {
          ...pageData.matches[0],
          id: "past-scheduled-match",
          kickoffAt: "2026-07-20T13:45:00.000Z",
          status: "scheduled",
        },
        {
          ...pageData.matches[0],
          id: "cancelled-future-match",
          kickoffAt: "2026-08-08T13:45:00.000Z",
          status: "cancelled",
        },
        {
          ...pageData.matches[0],
          id: "live-future-match",
          kickoffAt: "2026-08-15T13:45:00.000Z",
          status: "live",
        },
      ],
    });
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasPreview: false, hasRecap: true },
    });

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    render(element);

    expect(screen.getByText("直近の対戦")).toBeInTheDocument();
    expect(screen.queryByText("次回対戦")).not.toBeInTheDocument();
  });

  it("selects the latest finished match using its kickoff time", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      matches: [
        {
          ...pageData.matches[0],
          id: "finished-earlier-match",
          kickoffAt: "2026-07-21T00:00:00.000Z",
        },
        {
          ...pageData.matches[0],
          id: "finished-latest-match",
          kickoffAt: "2026-07-20T23:30:00.000-03:00",
        },
      ],
    });
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      "finished-latest-match": { hasPreview: false, hasRecap: true },
    });

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    render(element);

    expect(
      screen.getByRole("link", { name: "直近の対戦のレビューを読む →" }),
    ).toHaveAttribute("href", "/matches/finished-latest-match");
  });

  it("renders all-time stats, prior meetings, the source, and collapses history after ten", async () => {
    const history = Array.from({ length: 11 }, (_, index) => ({
      playedOn: `199${Math.floor(index / 10)}-01-${String(index + 1).padStart(2, "0")}`,
      teamSlug: "japan",
      opponentSlug: "wales",
      teamScore: 20 + index,
      opponentScore: 10,
      venue: "Tokyo",
      competitionLabel: index === 0 ? "World Cup" : null,
    }));
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      matches: [],
      history,
      historyFetchedAt: "2026-09-23T12:00:00.000Z",
      teamA: { name: "日本", shortCode: "JPN", slug: "japan" },
      teamB: { name: "ウェールズ", shortCode: "WAL", slug: "wales" },
    });
    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "japan-vs-wales" }),
    });
    const { container } = render(element);

    expect(screen.getByText("11試合")).toBeInTheDocument();
    expect(screen.getByText("過去の対戦（11試合）")).toBeInTheDocument();
    expect(
      screen.getByText(
        "出典: Wikipedia『List of Japan national rugby union test matches』（2026年9月23日取得）",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("details")).toBeInTheDocument();
    expect(container.textContent).toContain("20 - 10");
    expect(
      screen.queryByText(
        "このカードは収録対戦データが少ないため、傾向の断定は避けています。",
      ),
    ).not.toBeInTheDocument();
  });

  it("uses historical totals in the description while preserving the title", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      matches: [],
      history: [
        {
          playedOn: "1973-09-24",
          teamSlug: "japan",
          opponentSlug: "wales",
          teamScore: 10,
          opponentScore: 7,
          venue: null,
          competitionLabel: null,
        },
      ],
      teamA: { name: "日本", shortCode: "JPN", slug: "japan" },
      teamB: { name: "ウェールズ", shortCode: "WAL", slug: "wales" },
    });
    await expect(
      generateMetadata({ params: Promise.resolve({ pair: "japan-vs-wales" }) }),
    ).resolves.toMatchObject({
      title: { absolute: "ラグビー 日本 対 ウェールズ 対戦成績 | Tryline" },
      description:
        "ラグビー日本とウェールズの通算対戦成績（1試合 1勝0敗）。過去の全対戦のスコアと、直近の日本語レビューへのリンク。",
    });
  });

  it("redirects reverse pair slugs to the canonical URL", async () => {
    await expect(
      HeadToHeadPage({
        params: Promise.resolve({ pair: "toulouse-vs-leinster" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/h2h/leinster-vs-toulouse");
  });

  it("notFound when the pair has no stored matches", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue(null);

    await expect(
      HeadToHeadPage({
        params: Promise.resolve({ pair: "bath-vs-leinster" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns canonical metadata for the normalized pair", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue(pageData);

    await expect(
      generateMetadata({
        params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
      }),
    ).resolves.toMatchObject({
      alternates: {
        canonical: "https://www.trylinerugby.com/h2h/leinster-vs-toulouse",
      },
      description:
        "ラグビーLeinsterとStade Toulousainの対戦成績（Tryline 収録分）。直近の対戦結果とスコア、日本語レビューへのリンク。",
      openGraph: {
        description:
          "ラグビーLeinsterとStade Toulousainの対戦成績（Tryline 収録分）。直近の対戦結果とスコア、日本語レビューへのリンク。",
        locale: "ja_JP",
        title: "ラグビー Leinster 対 Stade Toulousain 対戦成績 | Tryline",
      },
      title: {
        absolute: "ラグビー Leinster 対 Stade Toulousain 対戦成績 | Tryline",
      },
    });
  });
});
