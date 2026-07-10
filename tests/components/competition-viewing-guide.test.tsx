// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompetitionViewingGuide } from "@/components/competition-viewing-guide";

describe("CompetitionViewingGuide", () => {
  it("renders markdown content and external links", () => {
    render(
      <CompetitionViewingGuide
        markdown={
          "配信サービスで視聴できます。\n\n- [公式サイト](https://example.com/watch)\n- 見逃し配信あり"
        }
        sourceUrl="https://example.com/watch"
        verifiedAt="2026-07-10T00:00:00.000Z"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "大会ガイド" }),
    ).toBeInTheDocument();
    expect(screen.getByText("見逃し配信あり")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "公式サイト" })).toHaveAttribute(
      "href",
      "https://example.com/watch",
    );
    expect(screen.getByText(/最終確認日: 2026-07-10/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "参照元" })).toHaveAttribute(
      "href",
      "https://example.com/watch",
    );
  });

  it("hides unverified broadcast claims and shows a verification notice", () => {
    render(
      <CompetitionViewingGuide
        markdown={
          "## 見どころ\n\n強豪同士の対戦に注目です。\n\n## 日本での視聴方法\n\n- **DAZN**: 全試合ライブ配信。"
        }
      />,
    );

    expect(screen.getByText("強豪同士の対戦に注目です。")).toBeInTheDocument();
    expect(screen.queryByText(/全試合ライブ配信/)).not.toBeInTheDocument();
    expect(screen.getByText(/放送・配信情報は確認中です/)).toBeInTheDocument();
  });

  it("renders ordered lists and bold text", () => {
    const { container } = render(
      <CompetitionViewingGuide markdown={"1. **優勝候補**を確認\n2. 日程を見る"} />,
    );

    const list = container.querySelector("ol");

    expect(list).not.toBeNull();
    expect(list).toHaveClass("list-decimal");
    expect(screen.getByText("優勝候補")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByText("日程を見る")).toBeInTheDocument();
  });

  it("renders nothing when the guide is empty", () => {
    const { container } = render(
      <CompetitionViewingGuide markdown="   " />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("does not link unsafe markdown URLs", () => {
    const { container } = render(
      <CompetitionViewingGuide markdown="[危険なリンク](javascript:alert(1))" />,
    );

    expect(container.textContent).toContain("危険なリンク");
    expect(container.querySelector("a")).toBeNull();
  });
});
