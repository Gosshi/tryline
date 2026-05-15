// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchContent } from "@/components/match-content";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

const baseContent: PublishedMatchContent = {
  contentMdJa: "",
  contentType: "preview",
  generatedAt: "2027-02-04T14:12:00.000Z",
  modelVersion: "gpt-4o-2024-11-20",
  promptVersion: "preview@1.0.0",
};

describe("MatchContent", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders markdown with GFM structures", () => {
    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa:
            "# 見出し\n\n- 項目1\n\n| 列1 | 列2 |\n| --- | --- |\n| A | B |\n\n[Tryline](https://example.com)",
        }}
        contentType="preview"
        isPremium
      />,
    );

    expect(screen.getByText("見出し")).toBeInTheDocument();
    expect(screen.getByText("項目1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tryline" })).toBeInTheDocument();
    expect(screen.getByText("列1")).toBeInTheDocument();
  });

  it("does not create executable script elements", () => {
    const { container } = render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: "本文\n\n<script>alert('x')</script>",
        }}
        contentType="preview"
        isPremium
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(
      screen.getByText(/<script>alert\('x'\)<\/script>/),
    ).toBeInTheDocument();
  });

  it("shows generatedAt in JST", () => {
    render(
      <MatchContent content={baseContent} contentType="preview" isPremium />,
    );

    expect(screen.getByText("2027-02-04 23:12 JST 更新")).toBeInTheDocument();
  });

  it("truncates free content and shows the premium CTA without TOC", () => {
    const visibleText = "あ".repeat(300);
    const lockedText = "い".repeat(40);

    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `# 見出し1\n\n# 見出し2\n\n${visibleText}${lockedText}`,
        }}
        contentType="preview"
        isPremium={false}
      />,
    );

    expect(screen.queryByRole("navigation", { name: "目次" })).toBeNull();
    expect(screen.getByText(/続きは Premium/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Premium で全文を読む" }),
    ).toHaveAttribute("href", "/pricing");
    expect(
      screen.getByText(new RegExp(visibleText.slice(0, 40))),
    ).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(lockedText))).toBeNull();
  });

  it("keeps the free teaser and gradient while hiding the premium CTA", () => {
    const visibleText = "あ".repeat(300);

    const { container } = render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `${visibleText}\n\n# 続きの見出し\n\nロック本文`,
        }}
        contentType="preview"
        isPremium={false}
        showCta={false}
      />,
    );

    expect(screen.queryByText(/続きは Premium/)).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Premium で全文を読む" }),
    ).toBeNull();
    expect(screen.getByText("次のセクション")).toBeInTheDocument();
    expect(
      container.querySelector(".bg-gradient-to-t"),
    ).toBeInTheDocument();
  });

  it("teases the next locked heading for free users", () => {
    const visibleText = "あ".repeat(300);

    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `${visibleText}\n\n# ターニングポイント\n\nロック本文`,
        }}
        contentType="recap"
        isPremium={false}
      />,
    );

    expect(screen.getByText("次のセクション")).toBeInTheDocument();
    expect(screen.getByText("ターニングポイント →")).toBeInTheDocument();
    expect(screen.queryByText("ロック本文")).toBeNull();
  });

  it("does not show a heading teaser without a locked heading", () => {
    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `${"あ".repeat(300)}ロック本文のみ`,
        }}
        contentType="recap"
        isPremium={false}
      />,
    );

    expect(screen.queryByText("次のセクション")).toBeNull();
  });

  it("does not show a heading teaser for premium users", () => {
    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `${"あ".repeat(300)}\n\n# ターニングポイント\n\n本文`,
        }}
        contentType="recap"
        isPremium
      />,
    );

    expect(screen.queryByText("次のセクション")).toBeNull();
    expect(screen.getByText("ターニングポイント")).toBeInTheDocument();
  });

  it("shows full content and TOC for premium users", () => {
    const lockedText = "プレミアム本文";

    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `# 見出し1\n\n# 見出し2\n\n${lockedText}`,
        }}
        contentType="preview"
        isPremium
      />,
    );

    expect(screen.getByRole("navigation", { name: "目次" })).toBeInTheDocument();
    expect(screen.getByText(lockedText)).toBeInTheDocument();
    expect(screen.queryByText(/続きは Premium/)).toBeNull();
  });
});
