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
