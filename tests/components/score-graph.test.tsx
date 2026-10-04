// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ScoreGraph } from "@/components/score-graph";

afterEach(cleanup);

it("renders readable team legends outside the SVG, including a bright team color", () => {
  const { container } = render(
    <ScoreGraph
      awayTeamName="南アフリカ"
      awayTeamSlug="south-africa"
      finalAwayScore={38}
      finalHomeScore={42}
      homeTeamName="オーストラリア"
      homeTeamSlug="australia"
      timeline={[]}
    />,
  );

  for (const name of ["オーストラリア", "南アフリカ"]) {
    expect(screen.getByText(name).closest("svg")).toBeNull();
    expect(screen.getByText(name)).toBeVisible();
  }
  expect(container.querySelector("svg div")).toBeNull();
  expect(container.querySelector('i[style*="255, 215, 0"]')).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
