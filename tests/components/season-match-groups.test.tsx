// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SeasonMatchGroups,
  getDefaultOpenGroupIndex,
  getDefaultOpenGroupIndexes,
  shouldCollapseRoundGroups,
} from "@/components/season-match-groups";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { GroupKey } from "@/lib/format/match-groups";

vi.mock("next/navigation", () => ({
  usePathname: () => "/c/premiership/2024-25",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function buildMatch(
  id: string,
  kickoffAt: string,
  round: number,
): MatchListItem {
  return {
    awayScore: null,
    awayTeam: { name: `Away ${id}`, shortCode: `A${id}`, slug: `away-${id}` },
    homeScore: null,
    homeTeam: { name: `Home ${id}`, shortCode: `H${id}`, slug: `home-${id}` },
    id,
    kickoffAt,
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

describe("season match groups", () => {
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
});