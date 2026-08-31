// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SeasonMatchGroups,
  filterGroupsByRound,
  getRoundFilters,
  getMatchClassification,
  getDefaultOpenGroupIndex,
  getDefaultOpenGroupIndexes,
  shouldCollapseRoundGroups,
} from "@/components/season-match-groups";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { GroupKey } from "@/lib/format/match-groups";
import type { AnchorHTMLAttributes } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/c/premiership/2024-25",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const scrollIntoViewMock = vi.fn();

beforeEach(() => {
  cleanup();
  scrollIntoViewMock.mockClear();
  Element.prototype.scrollIntoView = scrollIntoViewMock;
});

function buildMatch(
  id: string,
  kickoffAt: string,
  round: number,
  kinds?: { away: "club" | "national"; home: "club" | "national" },
): MatchListItem {
  return {
    awayScore: null,
    awayTeam: {
      kind: kinds?.away,
      name: `Away ${id}`,
      shortCode: `A${id}`,
      slug: `away-${id}`,
    },
    homeScore: null,
    homeTeam: {
      kind: kinds?.home,
      name: `Home ${id}`,
      shortCode: `H${id}`,
      slug: `home-${id}`,
    },
    id,
    kickoffAt,
    poolName: null,
    round,
    roundName: null,
    status: "scheduled",
    venue: null,
  };
}

function buildGroup(
  round: number,
  kickoffAt: string,
): [GroupKey, MatchListItem[]] {
  return [
    { round, roundName: null, type: "round" },
    [buildMatch(String(round), kickoffAt, round)],
  ];
}

function buildPoolGroup(
  poolName: string,
  round: number,
): [GroupKey, MatchListItem[]] {
  const match = buildMatch(poolName, "2026-01-01T00:00:00.000Z", round);

  return [
    { round, roundName: poolName, type: "round" },
    [{ ...match, poolName, roundName: poolName }],
  ];
}

describe("season match groups", () => {
  it("does not create filters for competitions without pools", () => {
    const groupedMatches = Array.from({ length: 20 }, (_, index) =>
      buildGroup(index + 1, "2026-01-01T00:00:00.000Z"),
    );

    expect(getRoundFilters(groupedMatches)).toEqual([]);

    render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        groupedMatches={groupedMatches}
      />,
    );

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("derives every actual pool filter and excludes nonmatching matches", () => {
    const groupedMatches = [
      ...["Pool A", "Pool B", "Pool C", "Pool D", "Pool E", "Pool F"].map(
        (poolName, index) => buildPoolGroup(poolName, index + 1),
      ),
      [
        { round: null, roundName: "Knockout", type: "round" } as GroupKey,
        [
          {
            ...buildMatch("knockout", "2026-02-01T00:00:00.000Z", 7),
            roundName: "Knockout",
          },
        ],
      ] as [GroupKey, MatchListItem[]],
    ];
    const filters = getRoundFilters(groupedMatches);

    expect(filters).toEqual([
      { label: "全試合", value: "all" },
      { label: "プールA", value: "pool-a" },
      { label: "プールB", value: "pool-b" },
      { label: "プールC", value: "pool-c" },
      { label: "プールD", value: "pool-d" },
      { label: "プールE", value: "pool-e" },
      { label: "プールF", value: "pool-f" },
      { label: "ノックアウト", value: "knockout" },
    ]);
    expect(filterGroupsByRound(groupedMatches, "pool-a", filters)).toHaveLength(
      1,
    );
    expect(
      filterGroupsByRound(groupedMatches, "pool-a", filters)[0]?.[1],
    ).toHaveLength(1);
    expect(
      filterGroupsByRound(groupedMatches, "knockout", filters)[0]?.[1][0]?.id,
    ).toBe("knockout");
  });

  it("uses the tournament's own hemisphere labels for pool filters", () => {
    const groupedMatches = [
      buildPoolGroup("Northern Hemisphere", 1),
      buildPoolGroup("Southern Hemisphere", 2),
    ];

    expect(getRoundFilters(groupedMatches)).toEqual([
      { label: "全試合", value: "all" },
      { label: "北半球", value: "northern-hemisphere" },
      { label: "南半球", value: "southern-hemisphere" },
    ]);
  });

  it("collapses only round-based competitions with at least ten groups", () => {
    expect(
      shouldCollapseRoundGroups(
        Array.from({ length: 10 }, (_, index) =>
          buildGroup(index + 1, "2026-01-01T00:00:00.000Z"),
        ),
      ),
    ).toBe(true);
    expect(
      shouldCollapseRoundGroups(
        Array.from({ length: 5 }, (_, index) =>
          buildGroup(index + 1, "2026-01-01T00:00:00.000Z"),
        ),
      ),
    ).toBe(false);
  });

  it("opens the next future round after the latest completed round", () => {
    const groupedMatches = [
      buildGroup(1, "2026-01-01T00:00:00.000Z"),
      buildGroup(2, "2026-01-08T00:00:00.000Z"),
      buildGroup(3, "2026-01-15T00:00:00.000Z"),
    ];

    expect(
      getDefaultOpenGroupIndex(
        groupedMatches,
        new Date("2026-01-10T00:00:00.000Z"),
      ),
    ).toBe(2);
  });

  it("opens the default round and neighboring rounds by default", () => {
    const groupedMatches = [
      buildGroup(1, "2026-01-01T00:00:00.000Z"),
      buildGroup(2, "2026-01-08T00:00:00.000Z"),
      buildGroup(3, "2026-01-15T00:00:00.000Z"),
      buildGroup(4, "2026-01-22T00:00:00.000Z"),
    ];

    expect([
      ...getDefaultOpenGroupIndexes(
        groupedMatches,
        new Date("2026-01-10T00:00:00.000Z"),
      ),
    ]).toEqual([1, 2, 3]);
  });

  it("opens the first two rounds when all matches are in the future", () => {
    const groupedMatches = [
      buildGroup(1, "2026-01-08T00:00:00.000Z"),
      buildGroup(2, "2026-01-15T00:00:00.000Z"),
      buildGroup(3, "2026-01-22T00:00:00.000Z"),
    ];

    expect([
      ...getDefaultOpenGroupIndexes(
        groupedMatches,
        new Date("2026-01-01T00:00:00.000Z"),
      ),
    ]).toEqual([0, 1]);
  });

  it("opens the final two rounds when the season has fully started", () => {
    const groupedMatches = [
      buildGroup(1, "2026-01-01T00:00:00.000Z"),
      buildGroup(2, "2026-01-08T00:00:00.000Z"),
      buildGroup(3, "2026-01-15T00:00:00.000Z"),
    ];

    expect([
      ...getDefaultOpenGroupIndexes(
        groupedMatches,
        new Date("2026-01-22T00:00:00.000Z"),
      ),
    ]).toEqual([1, 2]);
  });

  it("toggles a collapsible round section", () => {
    const groupedMatches = Array.from({ length: 10 }, (_, index) =>
      buildGroup(
        index + 1,
        `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );

    const { container } = render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        groupedMatches={groupedMatches}
      />,
    );

    const roundNineButton = screen.getByRole("button", { name: "第9節" });
    const roundOneLink = container.querySelector('a[href="/matches/1"]');

    expect(roundOneLink?.closest(".hidden")).toBeInTheDocument();
    expect(roundNineButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(roundNineButton);
    expect(roundNineButton).toHaveAttribute("aria-expanded", "false");
  });

  it("scrolls to the center default-open round when groups are collapsible", () => {
    const groupedMatches = Array.from({ length: 10 }, (_, index) =>
      buildGroup(
        index + 1,
        `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );

    render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        groupedMatches={groupedMatches}
      />,
    );

    expect(screen.getByRole("button", { name: "第10節" })).toHaveAttribute(
      "data-round-index",
      "9",
    );
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("does not auto-scroll when groups are not collapsible", () => {
    const groupedMatches = Array.from({ length: 5 }, (_, index) =>
      buildGroup(
        index + 1,
        `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );

    render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        groupedMatches={groupedMatches}
      />,
    );

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("links numeric round headings to round hub pages", () => {
    const groupedMatches = [buildGroup(3, "2026-01-15T00:00:00.000Z")];

    const { container } = render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        groupedMatches={groupedMatches}
        roundHubBasePath="/c/six-nations/2025"
      />,
    );

    expect(
      container.querySelector('a[href="/c/six-nations/2025/round/3"]'),
    ).toHaveTextContent("第3節の結果・日程");
  });

  it("distinguishes greatest-rivalry test matches from tour matches", () => {
    const testMatch = buildMatch("test", "2026-08-23T15:00:00.000Z", 1, {
      away: "national",
      home: "national",
    });
    const tourMatch = buildMatch("tour", "2026-08-07T15:00:00.000Z", 1, {
      away: "national",
      home: "club",
    });

    const { container } = render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        family="greatest-rivalry"
        groupedMatches={[
          [
            { round: 1, roundName: null, type: "round" },
            [testMatch, tourMatch],
          ],
        ]}
      />,
    );

    expect(screen.getByText("テストマッチ")).toBeInTheDocument();
    expect(screen.getByText("ツアー戦")).toBeInTheDocument();
    expect(container.querySelector('[data-match-type="test"]')).toHaveClass(
      "border-2",
    );
    expect(getMatchClassification("greatest-rivalry", testMatch)).toBe("test");
    expect(getMatchClassification("greatest-rivalry", tourMatch)).toBe("tour");
  });

  it("classifies the existing greatest-rivalry teams as tests or tour matches", () => {
    const testMatch = buildMatch(
      "south-africa-new-zealand",
      "2026-08-22T15:00:00.000Z",
      1,
      { away: "national", home: "national" },
    );
    testMatch.awayTeam.slug = "new-zealand";
    testMatch.homeTeam.slug = "south-africa";

    expect(getMatchClassification("greatest-rivalry", testMatch)).toBe("test");

    for (const clubSlug of ["bulls", "lions", "sharks", "stormers"]) {
      expect(
        getMatchClassification("greatest-rivalry", {
          ...testMatch,
          id: `greatest-rivalry-${clubSlug}`,
          homeTeam: { ...testMatch.homeTeam, kind: "club", slug: clubSlug },
        }),
      ).toBe("tour");
    }
  });

  it.each([
    ["six-nations", { away: "national", home: "national" }],
    ["premiership", { away: "club", home: "club" }],
  ] as const)("does not label matches for %s", (family, kinds) => {
    render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        family={family}
        groupedMatches={[
          [
            { round: 1, roundName: null, type: "round" },
            [buildMatch(family, "2026-01-01T00:00:00.000Z", 1, kinds)],
          ],
        ]}
      />,
    );

    expect(screen.queryByText("テストマッチ")).not.toBeInTheDocument();
    expect(screen.queryByText("ツアー戦")).not.toBeInTheDocument();
  });
});
