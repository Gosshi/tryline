// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SeasonMatchGroups,
  getDefaultOpenGroupIndex,
  shouldCollapseRoundGroups,
} from "@/components/season-match-groups";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { GroupKey } from "@/lib/format/match-groups";

function buildMatch(id: string, kickoffAt: string, round: number): MatchListItem {
  return {
    awayScore: null,
    awayTeam: { name: `Away ${id}`, shortCode: `A${id}`, slug: `away-${id}` },
    homeScore: null,
    homeTeam: { name: `Home ${id}`, shortCode: `H${id}`, slug: `home-${id}` },
    id,
    kickoffAt,
    round,
    status: "scheduled",
    venue: null,
  };
}

function buildGroup(round: number, kickoffAt: string): [GroupKey, MatchListItem[]] {
  return [{ round, type: "round" }, [buildMatch(String(round), kickoffAt, round)]];
}

describe("season match groups", () => {
  it("collapses only round-based competitions with at least ten groups", () => {
    expect(
      shouldCollapseRoundGroups(Array.from({ length: 10 }, (_, index) =>
        buildGroup(index + 1, "2026-01-01T00:00:00.000Z"),
      )),
    ).toBe(true);
    expect(
      shouldCollapseRoundGroups(Array.from({ length: 5 }, (_, index) =>
        buildGroup(index + 1, "2026-01-01T00:00:00.000Z"),
      )),
    ).toBe(false);
  });

  it("opens the next future round after the latest completed round", () => {
    const groupedMatches = [
      buildGroup(1, "2026-01-01T00:00:00.000Z"),
      buildGroup(2, "2026-01-08T00:00:00.000Z"),
      buildGroup(3, "2026-01-15T00:00:00.000Z"),
    ];

    expect(
      getDefaultOpenGroupIndex(groupedMatches, new Date("2026-01-10T00:00:00.000Z")),
    ).toBe(2);
  });

  it("toggles a collapsible round section", () => {
    const groupedMatches = Array.from({ length: 10 }, (_, index) =>
      buildGroup(index + 1, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );

    render(
      <SeasonMatchGroups
        contentStatusMap={{}}
        groupedMatches={groupedMatches}
      />,
    );

    const roundOneButton = screen.getByRole("button", { name: "第1節" });

    expect(roundOneButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(roundOneButton);
    expect(roundOneButton).toHaveAttribute("aria-expanded", "true");
  });
});
