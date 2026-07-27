// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishedWeeklyNewsItem } from "@/lib/db/queries/weekly-news";

const weeklyNewsQueryMock = vi.hoisted(() => ({
  getPublishedWeeklyNewsItems: vi.fn(),
}));

vi.mock("@/lib/db/queries/weekly-news", () => weeklyNewsQueryMock);

function createNewsItem(
  overrides: Partial<PublishedWeeklyNewsItem> = {},
): PublishedWeeklyNewsItem {
  return {
    category: "transfer",
    id: "news-1",
    published_at: "2026-07-15T10:00:00.000Z",
    source_domain: "therugbypaper.co.uk",
    source_url: "https://www.therugbypaper.co.uk/news/transfer",
    summary_ja: "クラブが新加入選手を発表した。",
    title_ja: "新加入を発表",
    ...overrides,
  };
}

describe("/news page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T03:00:00.000Z"));
    weeklyNewsQueryMock.getPublishedWeeklyNewsItems.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("uses static metadata without querying weekly news", async () => {
    const { generateMetadata } = await import("@/app/news/page");

    expect(generateMetadata()).toMatchObject({
      alternates: { canonical: "https://www.trylinerugby.com/news" },
      description: expect.stringContaining("海外ラグビー"),
      title: "今週のニュース｜海外ラグビー",
    });
    expect(weeklyNewsQueryMock.getPublishedWeeklyNewsItems).not.toHaveBeenCalled();
  });

  it("renders published weekly news as semantic articles with source links", async () => {
    weeklyNewsQueryMock.getPublishedWeeklyNewsItems.mockResolvedValue([
      createNewsItem(),
    ]);
    const { default: WeeklyNewsPage } = await import("@/app/news/page");

    const { container } = render(await WeeklyNewsPage());

    expect(weeklyNewsQueryMock.getPublishedWeeklyNewsItems).toHaveBeenCalledWith(
      "2026-07-13",
      "2026-07-19",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "今週のニュース" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7月13日 - 19日 JST")).toBeInTheDocument();
    expect(screen.getByText("移籍・契約")).toBeInTheDocument();
    expect(screen.getByText("新加入を発表")).toBeInTheDocument();
    expect(screen.getByText("クラブが新加入選手を発表した。")).toBeInTheDocument();
    expect(screen.getByText("2026年7月15日")).toBeInTheDocument();
    expect(screen.getByRole("article")).toBeInTheDocument();
    expect(container.querySelector("main")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "出典: therugbypaper.co.uk" }),
    ).toHaveAttribute("href", "https://www.therugbypaper.co.uk/news/transfer");
    expect(
      screen.getByRole("link", { name: "出典: therugbypaper.co.uk" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "出典: therugbypaper.co.uk" }),
    ).toHaveAttribute("rel", "noopener");
  });

  it("keeps the page available with an empty state when no news is published", async () => {
    const { default: WeeklyNewsPage } = await import("@/app/news/page");

    render(await WeeklyNewsPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "今週のニュース" }),
    ).toBeInTheDocument();
    expect(screen.getByText("今週のニュースはまだありません。")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
