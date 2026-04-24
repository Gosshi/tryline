// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
  it("renders markdown with GFM structures", () => {
    render(
      <MatchContent
        content={{
          ...baseContent,
          contentMdJa:
            "# 見出し\n\n- 項目1\n\n| 列1 | 列2 |\n| --- | --- |\n| A | B |\n\n[Tryline](https://example.com)",
        }}
        contentType="preview"
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
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(
      screen.getByText(/<script>alert\('x'\)<\/script>/),
    ).toBeInTheDocument();
  });

  it("shows generatedAt in JST", () => {
    render(<MatchContent content={baseContent} contentType="preview" />);

    expect(screen.getByText("2027-02-04 23:12 JST 更新")).toBeInTheDocument();
  });
});
