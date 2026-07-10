// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const matchQueryMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));
const standingsQueryMock = vi.hoisted(() => ({
  getStandingPositionLookupForCompetitions: vi.fn(),
}));
const authMock = vi.hoisted(() => ({
  getUser: vi.fn(),
}));
const spoilerGuardMock = vi.hoisted(() => ({
  getSpoilerGuardEnabledForUser: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => authMock);
vi.mock("@/lib/db/queries/matches", () => matchQueryMock);
vi.mock("@/lib/db/queries/spoiler-guard", () => spoilerGuardMock);
vi.mock("@/lib/db/queries/standings", () => standingsQueryMock);
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

describe("/calendar page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T03:00:00.000Z"));
    matchQueryMock.getMatchesInRange.mockResolvedValue([]);
    authMock.getUser.mockResolvedValue(null);
    spoilerGuardMock.getSpoilerGuardEnabledForUser.mockResolvedValue(false);
    standingsQueryMock.getStandingPositionLookupForCompetitions.mockResolvedValue(
      new Map(),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("has canonical metadata and noindex for week query pages", async () => {
    const { generateMetadata } = await import("@/app/calendar/page");

    await expect(generateMetadata({})).resolves.toMatchObject({
      alternates: { canonical: "https://www.trylinerugby.com/calendar" },
      title: "今週の試合カレンダー｜海外ラグビー 日本時間",
    });
    await expect(
      generateMetadata({ searchParams: Promise.resolve({ week: "2026-07-13" }) }),
    ).resolves.toMatchObject({
      alternates: { canonical: "https://www.trylinerugby.com/calendar" },
      robots: { follow: true, index: false },
    });
  });

  it("renders the current weekly schedule empty state", async () => {
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({}));

    expect(
      screen.getByRole("heading", { name: "今週の試合カレンダー" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7月6日 - 12日 JST")).toBeInTheDocument();
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-05T15:00:00.000Z",
      "2026-07-12T15:00:00.000Z",
    );
    expect(screen.getByRole("link", { name: "前週" })).toHaveAttribute(
      "href",
      "/calendar?week=2026-06-29",
    );
    expect(screen.getByRole("link", { name: "今週" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(screen.getByRole("link", { name: "全大会を購読" })).toHaveAttribute(
      "href",
      "webcal://www.trylinerugby.com/api/calendar/all.ics",
    );
    expect(screen.getByRole("link", { name: "iCal URL" })).toHaveAttribute(
      "href",
      "https://www.trylinerugby.com/api/calendar/all.ics",
    );
    expect(screen.getByText(/この週に表示できる試合はありません/)).toBeInTheDocument();
  });

  it("uses a valid monday week query", async () => {
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({ searchParams: Promise.resolve({ week: "2026-07-13" }) }));

    expect(screen.getByText("7月13日 - 19日 JST")).toBeInTheDocument();
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-12T15:00:00.000Z",
      "2026-07-19T15:00:00.000Z",
    );
  });

  it("falls back to current week for invalid week queries", async () => {
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({ searchParams: Promise.resolve({ week: "2026-07-14" }) }));

    expect(screen.getByText("7月6日 - 12日 JST")).toBeInTheDocument();
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-05T15:00:00.000Z",
      "2026-07-12T15:00:00.000Z",
    );
  });
});
