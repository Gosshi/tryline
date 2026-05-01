// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatchCard } from "@/components/match-card";

import type { MatchListItem } from "@/lib/db/queries/matches";

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

const baseMatch: MatchListItem = {
  awayScore: null,
  awayTeam: {
    name: "France",
    shortCode: "FRA",
    slug: "france",
  },
  homeScore: null,
  homeTeam: {
    name: "Ireland",
    shortCode: "IRL",
    slug: "ireland",
  },
  id: "00000000-0000-0000-0000-000000000001",
  kickoffAt: "2027-02-05T20:15:00.000Z",
  round: 1,
  status: "scheduled",
  venue: "Aviva Stadium",
};

describe("MatchCard", () => {
  it("renders a finished scoreline and dims the losing team", () => {
    render(
      <MatchCard
        match={{
          ...baseMatch,
          awayScore: 21,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );

    expect(screen.getByText("24")).toHaveClass("text-[var(--color-ink)]");
    expect(screen.getByText("21")).toHaveClass(
      "text-[var(--color-ink-muted)]",
    );
    expect(screen.getByText("FRA 🇫🇷")).toHaveClass(
      "text-[var(--color-ink-muted)]",
    );
    expect(screen.getByText("Ireland")).toHaveClass(
      "text-[var(--color-ink)]",
    );
  });

  it("renders an em dash for a scheduled match", () => {
    render(<MatchCard match={baseMatch} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hides the status badge for a finished match", () => {
    render(
      <MatchCard
        match={{
          ...baseMatch,
          awayScore: 21,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );

    expect(screen.queryByText("終了")).not.toBeInTheDocument();
  });

  it.each([
    ["scheduled", "キックオフ予定"],
    ["in_progress", "試合中"],
    ["postponed", "延期"],
    ["cancelled", "中止"],
  ] as const)("shows the status badge for %s matches", (status, label) => {
    const { container } = render(<MatchCard match={{ ...baseMatch, status }} />);
    const card = within(container);

    expect(card.getByText(label)).toBeInTheDocument();
  });

  it("uses mobile-friendly short-code sizing while preserving desktop sizing", () => {
    const { container } = render(<MatchCard match={baseMatch} />);
    const card = within(container);

    expect(card.getByText("🇮🇪 IRL")).toHaveClass(
      "truncate",
      "text-base",
      "sm:text-xl",
    );
    expect(card.getByText("FRA 🇫🇷")).toHaveClass(
      "truncate",
      "text-base",
      "sm:text-xl",
    );
  });

  it("uses the redesigned lifted card treatment", () => {
    const { container } = render(<MatchCard match={baseMatch} />);

    expect(container.querySelector("a")).toHaveClass(
      "focus-visible:ring-[var(--color-accent)]",
    );
    expect(container.querySelector("article")).toHaveClass(
      "shadow-sm",
      "transition-all",
      "hover:-translate-y-0.5",
      "hover:shadow-md",
    );
  });

  it("uses the display font for the score column", () => {
    const { container } = render(<MatchCard match={baseMatch} />);

    expect(within(container).getByText("—")).toHaveClass(
      "font-display",
      "text-[var(--color-rule)]",
    );
  });

  it("uses home and away team stripes on the card edges", () => {
    const { container } = render(<MatchCard match={baseMatch} />);
    const stripes = container.querySelectorAll("[aria-hidden='true']");

    expect(container.querySelector("article")).not.toHaveClass("border-l-4");
    expect(stripes).toHaveLength(2);
    expect(stripes[0]).toHaveClass(
      "absolute",
      "inset-y-0",
      "left-0",
      "w-[4px]",
    );
    expect(stripes[0]).toHaveStyle({
      background:
        "linear-gradient(to bottom, #169B62 0%, #169B62 33%, #FFFFFF 33%, #FFFFFF 67%, #F77F00 67%, #F77F00 100%)",
    });
    expect(stripes[1]).toHaveClass(
      "absolute",
      "inset-y-0",
      "right-0",
      "w-[4px]",
    );
    expect(stripes[1]).toHaveStyle({
      background:
        "linear-gradient(to bottom, #002395 0%, #002395 33%, #FFFFFF 33%, #FFFFFF 67%, #ED2939 67%, #ED2939 100%)",
    });
  });
});
