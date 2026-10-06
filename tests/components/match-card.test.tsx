// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MatchCard } from "@/components/match-card";
import { getTeamStripe } from "@/lib/format/team-identity";

import type { MatchListItem } from "@/lib/db/queries/matches";

const guard = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/components/user-state-provider", () => ({
  useUserState: () => ({ spoilerGuardEnabled: guard.enabled }),
}));
beforeEach(() => {
  cleanup();
  guard.enabled = false;
});

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
  kickoffTimeTbd: false,
  poolName: null,
  round: 1,
  roundName: null,
  status: "scheduled",
  venue: "Aviva Stadium",
};

describe("MatchCard", () => {
  it("renders the season row with time, grouped teams and a separate score cell", () => {
    const { container } = render(
      <MatchCard
        layout="row"
        match={{
          ...baseMatch,
          status: "finished",
          homeScore: 24,
          awayScore: 21,
        }}
      />,
    );
    const row = container.querySelector("a")!;
    expect(row).toHaveAttribute("data-match-layout", "row");
    expect(row).toHaveClass("grid-cols-[76px_minmax(0,1fr)_64px]");
    expect(row.firstElementChild).toHaveAttribute(
      "datetime",
      baseMatch.kickoffAt,
    );
    expect(row.children[1]).toHaveTextContent("Ireland対France");
    expect(row.children[2]).toHaveTextContent("24–21");
    expect(row).toHaveAttribute("href", `/matches/${baseMatch.id}`);
    expect(row.querySelector("article")).toBeNull();
  });

  it("hides row scores and winner cues when the existing guard is enabled", () => {
    guard.enabled = true;
    const { container } = render(
      <MatchCard
        layout="row"
        match={{
          ...baseMatch,
          status: "finished",
          homeScore: 24,
          awayScore: 21,
        }}
      />,
    );
    expect(container).not.toHaveTextContent("24–21");
    expect(container).not.toHaveTextContent("WIN");
    expect(container.querySelector("a")).toHaveAttribute(
      "href",
      `/matches/${baseMatch.id}`,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "タップして結果を見る" }),
    );
    expect(container).toHaveTextContent("24–21");
  });

  it("renders a finished scoreline and dims the losing team", () => {
    const { container } = render(
      <MatchCard
        match={{
          ...baseMatch,
          awayScore: 21,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );
    const card = within(container);

    expect(card.getByText("24")).toHaveClass(
      "text-4xl",
      "font-black",
      "text-[var(--color-accent)]",
    );
    expect(card.getByText("21")).toHaveClass(
      "text-3xl",
      "text-[var(--color-ink-muted)]",
    );
    expect(card.getByText("FRA")).toHaveClass("text-[var(--color-ink-muted)]");
    expect(card.getByText("Ireland").parentElement).toHaveClass(
      "text-[var(--color-ink)]",
    );
    expect(card.getByText("W")).toHaveClass(
      "bg-[var(--color-accent-dim)]",
      "text-[var(--color-accent)]",
    );
    expect(screen.getByText("L")).toHaveClass(
      "bg-[var(--color-panel)]",
      "text-[var(--color-ink-muted)]",
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
    const { container } = render(
      <MatchCard match={{ ...baseMatch, status }} />,
    );
    const card = within(container);

    expect(card.getByText(label)).toBeInTheDocument();
  });

  it("uses mobile-friendly short-code sizing while preserving desktop sizing", () => {
    const { container } = render(<MatchCard match={baseMatch} />);
    const card = within(container);

    expect(card.getByText("IRL")).toHaveClass("text-base");
    expect(card.getByText("FRA")).toHaveClass("text-base");
  });

  it("renders club team badges at 28px in match cards", () => {
    render(
      <MatchCard
        match={{
          ...baseMatch,
          awayTeam: {
            name: "Bristol Bears",
            shortCode: "BRI",
            slug: "bristol",
          },
          homeTeam: {
            name: "Bath",
            shortCode: "BAT",
            slug: "bath",
          },
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "BAT" })).toHaveAttribute(
      "width",
      "28",
    );
    expect(screen.getByRole("img", { name: "BAT" })).toHaveAttribute(
      "height",
      "28",
    );
    expect(screen.getByRole("img", { name: "BRI" })).toHaveAttribute(
      "width",
      "28",
    );
    expect(screen.getByRole("img", { name: "BRI" })).toHaveAttribute(
      "height",
      "28",
    );
  });

  it("uses a flat paper card with the new content radius", () => {
    const { container } = render(<MatchCard match={baseMatch} />);
    const article = container.querySelector("article");

    expect(container.querySelector("a")).toHaveClass(
      "focus-visible:ring-[var(--color-accent)]",
    );
    expect(article).toHaveClass(
      "rounded-sm",
      "border-[var(--color-rule)]",
      "bg-card",
      "hover:-translate-y-0.5",
    );
    expect(article).not.toHaveClass("shadow-sm");
  });

  it("does not use a team-tinted background on the paper card", () => {
    const { container } = render(<MatchCard match={baseMatch} />);
    const article = container.querySelector("article");

    expect(article).toHaveClass("bg-card");
    expect(article?.style.background).toBe("");
    expect(article?.style.backgroundColor).toBe("");
  });

  it("uses the body font for the score column", () => {
    const { container } = render(<MatchCard match={baseMatch} />);

    expect(within(container).getByText("—")).toHaveClass(
      "font-body",
      "text-[var(--color-rule)]",
    );
  });

  it("places each team's existing color stripe beside its name", () => {
    const { container } = render(<MatchCard match={baseMatch} />);
    const card = within(container);
    const homeName = card.getByText("Ireland");
    const awayName = card.getByText("France");

    expect(
      homeName.parentElement?.querySelector("[aria-hidden='true']"),
    ).toHaveStyle({ background: getTeamStripe("ireland") });
    expect(
      awayName.parentElement?.querySelector("[aria-hidden='true']"),
    ).toHaveStyle({ background: getTeamStripe("france") });
  });

  it("keeps the losing team's color stripe beside its muted name", () => {
    const { container } = render(
      <MatchCard
        match={{
          ...baseMatch,
          awayScore: 21,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );
    const loserName = within(container).getByText("France");
    const loserRow = loserName.parentElement;

    expect(loserRow).toHaveClass("text-[var(--color-ink-muted)]");
    expect(loserRow?.querySelector("[aria-hidden='true']")).toHaveStyle({
      background: getTeamStripe("france"),
    });
  });

  it("does not show a winner badge for drawn finished matches", () => {
    const { container } = render(
      <MatchCard
        match={{
          ...baseMatch,
          awayScore: 24,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );
    const card = within(container);

    expect(card.queryByText("W")).not.toBeInTheDocument();
    expect(card.queryByText("L")).not.toBeInTheDocument();
    expect(card.getAllByText("24")[0]).toHaveClass(
      "text-3xl",
      "text-[var(--color-ink)]",
    );
  });
});
