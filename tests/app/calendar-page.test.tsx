// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const matchQueryMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));

vi.mock("@/lib/db/queries/matches", () => matchQueryMock);
vi.mock("@/lib/format/week", () => ({
  getCurrentJstWeekRangeUtc: () => ({
    endUtcIso: "2026-06-14T15:00:00.000Z",
    startUtcIso: "2026-06-07T15:00:00.000Z",
  }),
}));
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
  it("has canonical metadata", async () => {
    const { generateMetadata } = await import("@/app/calendar/page");

    expect(generateMetadata()).toMatchObject({
      alternates: { canonical: "https://www.trylinerugby.com/calendar" },
      title: "今週の試合カレンダー",
    });
  });

  it("renders the weekly schedule empty state", async () => {
    matchQueryMock.getMatchesInRange.mockResolvedValue([]);
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage());

    expect(screen.getByRole("heading", { name: "今週の試合" })).toBeInTheDocument();
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-06-07T15:00:00.000Z",
      "2026-06-14T15:00:00.000Z",
    );
    expect(screen.getByText(/今週表示できる試合はありません/)).toBeInTheDocument();
  });
});
