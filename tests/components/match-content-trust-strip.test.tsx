// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchContentTrustStrip } from "@/components/match-content-trust-strip";

describe("MatchContentTrustStrip", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows confirmed lineups and unique linked source domains", () => {
    render(
      <MatchContentTrustStrip
        hasConfirmedLineups
        sourcedFactSources={[
          {
            domain: "en.wikipedia.org",
            sourceUrl: "https://en.wikipedia.org/wiki/Rugby_union",
          },
          {
            domain: "en.wikipedia.org",
            sourceUrl: "https://en.wikipedia.org/wiki/Rugby_union_history",
          },
          {
            domain: "rugby-japan.jp",
            sourceUrl: "https://www.rugby-japan.jp/news/example",
          },
        ]}
      />,
    );

    expect(screen.getByText("ラインアップ確認済み")).toBeInTheDocument();
    expect(screen.getAllByText("出典: en.wikipedia.org")).toHaveLength(1);
    expect(screen.getByText("出典: rugby-japan.jp")).toHaveAttribute(
      "href",
      "https://www.rugby-japan.jp/news/example",
    );
    expect(screen.getByText("出典: en.wikipedia.org")).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByText("出典: en.wikipedia.org")).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("shows an unlinked domain when its source URL is missing", () => {
    render(
      <MatchContentTrustStrip
        hasConfirmedLineups={false}
        sourcedFactSources={[{ domain: "en.wikipedia.org", sourceUrl: null }]}
      />,
    );

    expect(screen.getByText("出典: en.wikipedia.org")).not.toHaveAttribute(
      "href",
    );
  });

  it("adds a neutral integrity disclosure without changing existing trust labels", () => {
    render(
      <MatchContentTrustStrip
        eventIntegrity="mismatch"
        hasConfirmedLineups
        sourcedFactSources={[
          {
            domain: "rugby-japan.jp",
            sourceUrl: "https://www.rugby-japan.jp/news/example",
          },
        ]}
      />,
    );

    expect(
      screen.getByText(
        "この記事の得点経過は現在の記録と一致していません。確認のうえ更新します。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("ラインアップ確認済み")).toBeInTheDocument();
    expect(screen.getByText("出典: rugby-japan.jp")).toHaveAttribute(
      "href",
      "https://www.rugby-japan.jp/news/example",
    );
    expect(screen.queryByText(/この記事は誤っています|AI が生成/)).toBeNull();
  });

  it.each(["unavailable", "verified"] as const)(
    "does not disclose event integrity when it is %s",
    (eventIntegrity) => {
      const { container } = render(
        <MatchContentTrustStrip
          eventIntegrity={eventIntegrity}
          hasConfirmedLineups={false}
          sourcedFactSources={[]}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    },
  );

  it("renders nothing without sources or trust labels", () => {
    const { container } = render(
      <MatchContentTrustStrip
        hasConfirmedLineups={false}
        sourcedFactSources={[]}
      />,
    );

    expect(screen.queryByText("ラインアップ確認済み")).toBeNull();
    expect(screen.queryByText(/出典:/)).toBeNull();
    expect(screen.queryByText(/未確認/)).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
