// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScheduleCoverageNotice } from "@/components/schedule-coverage-notice";

const top14 = {
  family: "top-14",
  ingestedRoundCount: 3,
  missingFixtures: null,
  missingRounds: 23,
  name: "Top 14",
  nameJa: null,
  season: "2026-27",
  slug: "top-14-2026-27",
  totalRounds: 26,
};

describe("ScheduleCoverageNotice", () => {
  afterEach(cleanup);
  it("shows the total and ingested rounds when rounds are missing", () => {
    render(<ScheduleCoverageNotice competitions={[top14]} />);

    expect(screen.getByLabelText("日程掲載状況")).toHaveTextContent(
      "トップ14 2026-27: 全26節中3節を掲載しています。",
    );
  });

  it("reports fixture gaps after all rounds are available", () => {
    render(
      <ScheduleCoverageNotice
        competitions={[
          { ...top14, missingFixtures: 5, missingRounds: 0, totalRounds: 18 },
        ]}
      />,
    );

    expect(screen.getByLabelText("日程掲載状況")).toHaveTextContent(
      "トップ14 2026-27: 18節を掲載していますが、一部の試合が未取得です。",
    );
  });

  it("reports both kinds of gap without promising a restoration time", () => {
    render(
      <ScheduleCoverageNotice
        competitions={[{ ...top14, missingFixtures: 5 }]}
      />,
    );

    const notice = screen.getByLabelText("日程掲載状況");
    expect(notice).toHaveTextContent(
      "全26節中3節を掲載しています。 一部の試合が未取得です。",
    );
    expect(notice).not.toHaveTextContent(/いつ戻る|復旧予定/);
  });

  it("does not render when no rounds or fixtures are missing", () => {
    render(
      <ScheduleCoverageNotice
        competitions={[{ ...top14, missingFixtures: 0, missingRounds: 0 }]}
      />,
    );

    expect(screen.queryByLabelText("日程掲載状況")).not.toBeInTheDocument();
  });

  it("keeps the existing notice style tokens", () => {
    const { container } = render(
      <ScheduleCoverageNotice competitions={[top14]} />,
    );

    const notice = container.querySelector("aside");
    expect(notice).toHaveClass("border-l-4", "border-[var(--color-rule)]");
    expect(notice).toHaveTextContent("日程掲載状況");
    expect(notice?.querySelector("p")).toHaveClass(
      "text-xs",
      "font-bold",
      "tracking-[0.12em]",
      "text-[var(--color-ink-muted)]",
    );
  });
});
