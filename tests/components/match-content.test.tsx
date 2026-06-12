// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchContent } from "@/components/match-content";
import { splitRecapForPaywall } from "@/lib/match-content/markdown";

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
    expect(
      screen.getByText("週末の注目試合と無料サンプルは X / note で更新中"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "フォローする" })).toHaveAttribute(
      "href",
      "https://x.com/tryline_rugbyjp",
    );
    expect(screen.getByRole("link", { name: "フォローする" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(
      screen.getByRole("link", { name: "note @tryline_rugbyjp" }),
    ).toHaveAttribute("href", "https://note.com/tryline_rugbyjp");
    expect(
      screen.getByRole("link", { name: "note @tryline_rugbyjp" }),
    ).toHaveAttribute("target", "_blank");
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

  it("shows the first section and locks content from the second top-level heading", () => {
    const visibleText = "無料で読める第1セクション本文";
    const lockedText = "プレミアム本文";

    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `# 見出し1\n\n${visibleText}\n\n# 見出し2\n\n${lockedText}`,
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
    expect(screen.getByText(visibleText)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "見出し2" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(lockedText)).toBeNull();
  });

  it("uses match-specific copy for the locked premium CTA", () => {
    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: "# 見出し1\n\n無料本文\n\n# 見出し2\n\nロック本文",
        }}
        contentType="preview"
        isPremium={false}
        matchTitle="Ireland vs France"
      />,
    );

    expect(
      screen.getByText("Ireland vs France の勝負どころを最後まで読む"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "7日間無料でレビュー全文を読む",
      }),
    ).toHaveAttribute("href", "/pricing");
  });

  it("keeps the free teaser and gradient while hiding the premium CTA", () => {
    const visibleText = "無料で読める本文";

    const { container } = render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `# 概要\n\n${visibleText}\n\n# 続きの見出し\n\nロック本文`,
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
    expect(container.querySelector(".bg-gradient-to-t")).toBeInTheDocument();
  });

  it("teases the third recap heading for free users", () => {
    const visibleText = "試合の流れをまとめた無料本文";
    const secondSectionText = "試合全体像の全文";

    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `# この試合の核心\n\n${visibleText}\n\n# 試合全体像\n\n${secondSectionText}`,
        }}
        contentType="recap"
        hasLockedContent
        isPremium={false}
        nextLockedHeading="ターニングポイント"
      />,
    );

    expect(screen.getByText("次のセクション")).toBeInTheDocument();
    expect(screen.getByText("ターニングポイント →")).toBeInTheDocument();
    expect(screen.getByText(secondSectionText)).toBeInTheDocument();
    expect(screen.queryByText("ロック本文")).toBeNull();
    expect(screen.getByRole("link", { name: "フォローする" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(
      screen.getByRole("link", { name: "note @tryline_rugbyjp" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not lock recap content when there are only two h1 headings", () => {
    const secondText = "2つ目のH1本文";

    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: `# この試合の核心\n\n無料本文\n\n# 試合全体像\n\n${secondText}`,
        }}
        contentType="recap"
        isPremium={false}
      />,
    );

    expect(screen.getByText(secondText)).toBeInTheDocument();
    expect(screen.queryByText("次のセクション")).toBeNull();
    expect(screen.queryByText(/続きは Premium/)).toBeNull();
  });

  it("locks recap content from the third h1 when h1 and h2 headings coexist", () => {
    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa:
            "# この試合の核心\n\n無料本文\n\n## 無料内の小見出し\n\n小見出し本文\n\n# 試合全体像\n\n全体像本文",
        }}
        contentType="recap"
        hasLockedContent
        isPremium={false}
        nextLockedHeading="有料セクション"
      />,
    );

    expect(screen.getByText("無料内の小見出し")).toBeInTheDocument();
    expect(screen.getByText("小見出し本文")).toBeInTheDocument();
    expect(screen.getByText("全体像本文")).toBeInTheDocument();
    expect(screen.getByText("有料セクション →")).toBeInTheDocument();
    expect(screen.queryByText("ロック本文")).toBeNull();
  });

  it("does not lock content when there is no second top-level heading", () => {
    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa: "# 試合概要\n\n本文のみ",
        }}
        contentType="recap"
        isPremium={false}
      />,
    );

    expect(screen.queryByText("次のセクション")).toBeNull();
    expect(screen.getByText("本文のみ")).toBeInTheDocument();
    expect(screen.queryByText(/続きは Premium/)).toBeNull();
  });

  it("splits recap markdown from the third h1 heading", () => {
    expect(
      splitRecapForPaywall(
        "# この試合の核心\n\n核心本文\n\n# 試合全体像\n\n全体像本文\n\n# ターニングポイント\n\n有料本文",
      ),
    ).toEqual({
      freeMd: "# この試合の核心\n\n核心本文\n\n# 試合全体像\n\n全体像本文",
      hasLocked: true,
      lockedMd: "# ターニングポイント\n\n有料本文",
      nextHeadingText: "ターニングポイント",
    });
  });

  it("does not lock recap markdown with only two h1 headings", () => {
    const markdown = "# この試合の核心\n\n核心本文\n\n# 試合全体像\n\n全体像本文";

    expect(splitRecapForPaywall(markdown)).toEqual({
      freeMd: markdown,
      hasLocked: false,
      lockedMd: null,
      nextHeadingText: null,
    });
  });

  it("falls back to h2 headings when recap has no repeated h1 sections", () => {
    expect(
      splitRecapForPaywall(
        "# レビュー\n\n## この試合の核心\n\n核心本文\n\n## 試合全体像\n\n全体像本文\n\n## ターニングポイント\n\n有料本文",
      ),
    ).toEqual({
      freeMd:
        "# レビュー\n\n## この試合の核心\n\n核心本文\n\n## 試合全体像\n\n全体像本文",
      hasLocked: true,
      lockedMd: "## ターニングポイント\n\n有料本文",
      nextHeadingText: "ターニングポイント",
    });
  });

  it("does not lock recap paragraph-only markdown", () => {
    const markdown = "段落1\n\n段落2";

    expect(splitRecapForPaywall(markdown)).toEqual({
      freeMd: markdown,
      hasLocked: false,
      lockedMd: null,
      nextHeadingText: null,
    });
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

    expect(
      screen.getByRole("navigation", { name: "目次" }),
    ).toBeInTheDocument();
    expect(screen.getByText(lockedText)).toBeInTheDocument();
    expect(screen.queryByText(/続きは Premium/)).toBeNull();
  });
});
