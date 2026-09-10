// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Rwc2027BracketPage from "@/app/c/rwc/2027/bracket/page";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { AnchorHTMLAttributes, ReactNode } from "react";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
}));
const matchesMock = vi.hoisted(() => ({
  listMatchesForCompetition: vi.fn(),
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
vi.mock("@/lib/db/queries/competitions", () => competitionsMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);

const competition = {
  family: "rwc",
  id: "rwc-2027",
  name: "Rugby World Cup 2027",
  season: "2027",
  slug: "rwc-2027",
};

function buildMatch(params: Partial<MatchListItem>): MatchListItem {
  return {
    awayScore: null,
    awayTeam: { name: "Away", shortCode: "AWY", slug: "away" },
    homeScore: null,
    homeTeam: { name: "Home", shortCode: "HME", slug: "home" },
    id: "match-1",
    kickoffAt: "2027-10-17T08:00:00.000Z",
    poolName: "Pool A",
    round: null,
    roundName: null,
    status: "scheduled",
    venue: "Sydney",
    ...params,
  };
}

describe("RWC 2027 bracket page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    competitionsMock.getCompetitionBySlug.mockResolvedValue(competition);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("explains that teams are pending and links to the pool schedule before pool play ends", async () => {
    vi.setSystemTime(new Date("2027-10-10T00:00:00.000Z"));
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      buildMatch({ id: "pool-1", kickoffAt: "2027-10-01T08:00:00.000Z" }),
      buildMatch({ id: "pool-36", kickoffAt: "2027-10-17T08:00:00.000Z" }),
    ]);

    render(await Rwc2027BracketPage());

    expect(
      screen.getByText(
        /出場チームは、プール戦の結果が確定するまで決まりません/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "プール戦の日程を見る" }),
    ).toHaveAttribute("href", "/c/rwc/2027");
    expect(
      screen.getByText(/2027年10月17日まで予定されています/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/準備中/)).not.toBeInTheDocument();
  });

  it("reports missing knockout data after the completed pool stage", async () => {
    vi.setSystemTime(new Date("2027-10-18T00:00:00.000Z"));
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      buildMatch({ id: "pool-1", status: "finished" }),
    ]);

    render(await Rwc2027BracketPage());

    expect(
      screen.getByText(/日程・結果はまだ取得できていません/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/出場チームは、プール戦の結果が確定するまで/),
    ).not.toBeInTheDocument();
  });

  it("renders the existing knockout bracket when a knockout match exists", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      buildMatch({
        id: "match-qf-1",
        poolName: null,
        round: 5,
      }),
    ]);

    render(await Rwc2027BracketPage());

    expect(
      screen.getByRole("heading", { name: "準々決勝" }),
    ).toBeInTheDocument();
  });

  it("keeps unavailable competition information separate from match states", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue(null);

    render(await Rwc2027BracketPage());

    expect(screen.getByText(/大会情報を取得できません/)).toBeInTheDocument();
    expect(matchesMock.listMatchesForCompetition).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/出場チームは、プール戦の結果が確定するまで/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/日程・結果はまだ取得できていません/),
    ).not.toBeInTheDocument();
  });
});
