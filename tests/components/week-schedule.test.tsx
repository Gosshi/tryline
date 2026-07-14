// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WeekSchedule } from "@/components/calendar/week-schedule";

import type { CalendarMatch } from "@/lib/db/queries/matches";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseMatch: CalendarMatch = {
  awayScore: null,
  awayTeam: {
    name: "Kobe Steelers",
    shortCode: "KOB",
    slug: "kobe-steelers",
  },
  competition: {
    family: "league-one",
    name: "Japan Rugby League One",
    season: "2025-26",
    slug: "league-one-2025-26",
  },
  hasPreview: false,
  hasRecap: false,
  homeScore: null,
  homeTeam: {
    name: "Kubota Spears",
    shortCode: "KUB",
    slug: "kubota-spears",
  },
  id: "match-1",
  kickoffAt: "2026-06-07T15:30:00.000Z",
  poolName: null,
  round: null,
  roundName: null,
  status: "scheduled",
  venue: "National Stadium",
};

describe("WeekSchedule", () => {
  afterEach(() => {
    cleanup();
  });

  it("groups matches by JST day and links every match page", () => {
    render(
      <WeekSchedule
        highlightMatchId="match-1"
        matches={[
          {
            ...baseMatch,
            hasPreview: true,
            hasRecap: true,
            id: "match-1",
            kickoffAt: "2026-06-07T15:30:00.000Z",
          },
          {
            ...baseMatch,
            awayScore: 19,
            hasPreview: true,
            homeScore: 24,
            id: "match-2",
            kickoffAt: "2026-06-08T15:00:00.000Z",
            status: "finished",
          },
          {
            ...baseMatch,
            id: "match-3",
            kickoffAt: "2026-06-08T16:00:00.000Z",
            status: "in_progress",
          },
        ]}
      />,
    );

    const june8Section = screen
      .getByRole("heading", { name: "8" })
      .closest("section");
    expect(june8Section).toHaveTextContent("月");
    expect(june8Section).toHaveTextContent("6月");
    expect(june8Section).toHaveTextContent("1試合");

    const june9Section = screen
      .getByRole("heading", { name: "9" })
      .closest("section");
    expect(june9Section).toHaveTextContent("火");
    expect(june9Section).toHaveTextContent("6月");
    expect(june9Section).toHaveTextContent("2試合");
    expect(screen.getByRole("link", { name: /00:30 JST/ })).toHaveAttribute(
      "href",
      "/matches/match-1",
    );
    expect(screen.getByText("注目")).toBeInTheDocument();
    expect(screen.getByText("レビュー")).toBeInTheDocument();
    expect(screen.getByText("プレビュー")).toBeInTheDocument();
    expect(screen.getByText("24–19")).toBeInTheDocument();
    expect(screen.getByText("ライブ")).toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(<WeekSchedule emptyMessage="試合なし" matches={[]} />);

    expect(screen.getByText("試合なし")).toBeInTheDocument();
  });

  it("renders broadcast links only for matches with a stored URL", () => {
    render(
      <WeekSchedule
        matches={[
          {
            ...baseMatch,
            broadcastJpUrl: "https://example.com/watch/match-1",
            id: "match-1",
          },
          {
            ...baseMatch,
            broadcastJpUrl: null,
            id: "match-2",
          },
        ]}
      />,
    );

    const links = screen.getAllByRole("link", { name: "視聴" });

    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://example.com/watch/match-1",
    );
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(screen.queryByText("視聴情報なし")).not.toBeInTheDocument();
  });

  it("hides finished scores behind spoiler guard until clicked", () => {
    render(
      <WeekSchedule
        matches={[
          {
            ...baseMatch,
            awayScore: 19,
            homeScore: 24,
            id: "match-2",
            status: "finished",
          },
        ]}
        spoilerGuardEnabled
      />,
    );

    expect(screen.queryByText("24–19")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "タップして結果を見る" }),
    );

    expect(screen.getByText("24–19")).toBeInTheDocument();
  });
});
