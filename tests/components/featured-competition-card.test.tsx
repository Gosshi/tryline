// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeaturedCompetitionCard } from "@/components/featured-competition-card";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span
      aria-label={alt || undefined}
      data-src={src}
      data-testid="featured-competition-image"
    />
  ),
}));

describe("FeaturedCompetitionCard", () => {
  it("renders supplied competition copy and falls back to the default visual", () => {
    render(
      <FeaturedCompetitionCard
        description="次戦はJapan 対 Australia（2026-08-08）。"
        family="lipovitan-challenge-cup"
        headline="リポビタンDチャレンジカップ 2026を追う"
        season="2026"
        stats={{
          nextMatchLabel: "2026-07-11 (土) 19:30 JST",
          nextMatchSubLabel: "Japan 対 Ireland",
          publishedReviewCount: 12,
          weekMatchCount: 1,
        }}
      />,
    );

    const headline = screen.getByRole("heading", {
      name: "リポビタンDチャレンジカップ 2026を追う",
    });
    expect(headline).toBeInTheDocument();
    expect(headline).toHaveClass("text-balance");
    expect(screen.getByTestId("featured-competition-image")).toHaveAttribute(
      "data-src",
      "/visuals/default.jpg",
    );
    expect(
      screen.getByRole("link", { name: "大会ページを見る →" }),
    ).toHaveAttribute("href", "/c/lipovitan-challenge-cup/2026");
  });
});
