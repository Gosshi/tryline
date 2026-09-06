// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchHeader } from "@/components/match-header";

import type { MatchDetail } from "@/lib/db/queries/matches";

const match: MatchDetail = {
  awayScore: null,
  awayTeam: {
    englishName: null,
    name: "France",
    shortCode: "FRA",
    slug: "france",
  },
  awayTeamId: "00000000-0000-0000-0000-000000000003",
  broadcasts: [],
  competition: {
    family: "six-nations",
    name: "Six Nations 2027",
    season: "2027",
    slug: "six-nations-2027",
  },
  homeScore: null,
  homeTeam: {
    englishName: null,
    name: "Ireland",
    shortCode: "IRL",
    slug: "ireland",
  },
  homeTeamId: "00000000-0000-0000-0000-000000000002",
  id: "00000000-0000-0000-0000-000000000001",
  kickoffAt: "2027-02-06T15:00:00.000Z",
  poolName: null,
  round: 1,
  roundName: null,
  status: "scheduled",
  venue: "Aviva Stadium",
};

afterEach(() => {
  cleanup();
});

describe("MatchHeader", () => {
  it.each([
    null,
    "",
    "Nonexistent Stadium",
    "Prince Chichibu Memorial Rugby Ground (Tokyo)",
  ])(
    "omits local time for %s while preserving JST and the venue label",
    (venue) => {
      const { container } = render(<MatchHeader match={{ ...match, venue }} />);

      expect(screen.queryByText(/^現地 /)).not.toBeInTheDocument();
      expect(screen.getByText("2027-02-07 (日) 00:00 JST")).toBeInTheDocument();
      expect(container.querySelectorAll("time")).toHaveLength(1);
      if (venue) {
        expect(screen.getByText(venue)).toBeInTheDocument();
      }
    },
  );

  it.each(["australia", "spain", "tonga", "chile", "georgia", "england"])(
    "uses Townsville local time for home team %s at a neutral venue",
    (slug) => {
      render(
        <MatchHeader
          match={{
            ...match,
            homeTeam: { ...match.homeTeam, slug },
            kickoffAt: "2026-08-15T05:00:00.000Z",
            venue: "North Queensland Stadium, Townsville[17]",
          }}
        />,
      );

      expect(
        screen.getByText(/^現地 2026-08-15 \(Sat\) 15:00 (AEST|GMT\+10)$/),
      ).toBeInTheDocument();
      expect(screen.getByText("2026-08-15 (土) 14:00 JST")).toBeInTheDocument();
      expect(
        screen.getByText("North Queensland Stadium, Townsville[17]"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/BST/)).not.toBeInTheDocument();
    },
  );

  it.each([
    ["2026-01-15T05:00:00.000Z", /^現地 2026-01-15 \(Thu\) 05:00 GMT$/],
    [
      "2026-08-15T05:00:00.000Z",
      /^現地 2026-08-15 \(Sat\) 06:00 (BST|GMT\+1)$/,
    ],
  ])("preserves London's seasonal offset at %s", (kickoffAt, localTime) => {
    render(
      <MatchHeader
        match={{ ...match, kickoffAt, venue: "Twickenham Stadium, London" }}
      />,
    );

    expect(screen.getByText(localTime)).toBeInTheDocument();
  });

  it("renders one screen-reader-only h1 for the match name", () => {
    const { container } = render(<MatchHeader match={match} />);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Ireland 対 France",
      }),
    ).toHaveClass("sr-only", "font-heading");
  });

  it("uses both team colors in the score hero background", () => {
    const { container } = render(<MatchHeader match={match} />);
    const hero = container.querySelector("section");

    expect(hero).toHaveStyle("--team-home: #009A44");
    expect(hero).toHaveStyle("--team-away: #002395");
    expect(hero?.getAttribute("style")).toContain("#009A44");
    expect(hero?.getAttribute("style")).toContain("#002395");
  });

  it("renders SVG flags with the team short codes", () => {
    const { container } = render(<MatchHeader match={match} />);
    const header = within(container);
    const homeCode = header.getByText("IRL");
    const awayCode = header.getByText("FRA");

    expect(homeCode).toHaveClass("font-number");
    expect(awayCode).toHaveClass("font-number");
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("shows live scores for an in-progress match", () => {
    render(
      <MatchHeader
        match={{
          ...match,
          awayScore: 10,
          homeScore: 12,
          status: "in_progress",
        }}
      />,
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  it("shows a WIN badge beside the finished-match winner", () => {
    render(
      <MatchHeader
        match={{
          ...match,
          awayScore: 18,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );

    expect(screen.getByText("WIN")).toBeInTheDocument();
  });

  it("hides finished scores behind spoiler guard until clicked", () => {
    render(
      <MatchHeader
        match={{
          ...match,
          awayScore: 18,
          homeScore: 24,
          status: "finished",
        }}
        spoilerGuardEnabled
      />,
    );

    expect(screen.queryByText("24")).not.toBeInTheDocument();
    expect(screen.queryByText("18")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "タップして結果を見る" }),
    );

    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("shows a YouTube highlight search link only for finished matches", () => {
    const { rerender } = render(<MatchHeader match={match} />);

    expect(
      screen.queryByRole("link", {
        name: "YouTube でハイライトを検索",
      }),
    ).not.toBeInTheDocument();

    rerender(
      <MatchHeader
        match={{
          ...match,
          awayScore: 28,
          homeScore: 31,
          status: "finished",
        }}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "YouTube でハイライトを検索",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.youtube.com/results?search_query=Ireland%20vs%20France%202027%20highlights",
    );
  });

  it("renders an H2H link when a stored matchup URL is provided", () => {
    render(
      <MatchHeader headToHeadHref="/h2h/france-vs-ireland" match={match} />,
    );

    expect(
      screen.getByRole("link", { name: "両者の対戦成績" }),
    ).toHaveAttribute("href", "/h2h/france-vs-ireland");
  });

  it("renders a broadcast section with service links when broadcasts are provided", () => {
    const { container } = render(
      <MatchHeader
        match={{
          ...match,
          broadcasts: [
            {
              displayOrder: 0,
              kind: "tv",
              serviceName: "WOWOW プライム",
              sourceUrl: "https://source.example.com",
              url: "https://example.com/wowow",
              verifiedAt: "2026-07-15T12:00:00.000Z",
            },
            {
              displayOrder: 1,
              kind: "streaming",
              serviceName: "J SPORTS オンデマンド",
              sourceUrl: null,
              url: "https://example.com/jsports",
              verifiedAt: "2026-07-16T12:00:00.000Z",
            },
          ],
        }}
      />,
    );

    const section = container.querySelector("#broadcasts");

    expect(section).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "視聴方法" }),
    ).toBeInTheDocument();
    expect(screen.getByText("放送")).toBeInTheDocument();
    expect(screen.getByText("配信")).toBeInTheDocument();
    expect(screen.getByText("確認日: 7/16")).toBeInTheDocument();
    expect(
      screen.queryByText("https://source.example.com"),
    ).not.toBeInTheDocument();

    const tvLink = screen.getByRole("link", { name: /WOWOW プライム/ });
    const streamingLink = screen.getByRole("link", {
      name: /J SPORTS オンデマンド/,
    });

    expect(tvLink).toHaveAttribute("href", "https://example.com/wowow");
    expect(tvLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(tvLink).toHaveAttribute("target", "_blank");
    expect(streamingLink).toHaveAttribute(
      "href",
      "https://example.com/jsports",
    );
    expect(streamingLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(streamingLink).toHaveAttribute("target", "_blank");
  });

  it("does not render a broadcast section or placeholder when broadcasts are empty", () => {
    const { container } = render(
      <MatchHeader
        match={{
          ...match,
          broadcastJpUrl: "https://example.com/legacy",
          broadcasts: [],
        }}
      />,
    );

    expect(container.querySelector("#broadcasts")).not.toBeInTheDocument();
    expect(screen.queryByText("視聴方法")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /視聴する/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("https://example.com/legacy"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("視聴情報なし")).not.toBeInTheDocument();
  });

  it("uses display name overrides for EN pages", () => {
    render(
      <MatchHeader
        awayDisplayName="Les Bleus"
        homeDisplayName="Irish Rugby"
        language="en"
        match={{
          ...match,
          awayScore: 28,
          homeScore: 31,
          status: "finished",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Irish Rugby vs Les Bleus",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Irish Rugby" })).toHaveAttribute(
      "href",
      "/teams/ireland",
    );
    expect(
      screen.getByRole("link", {
        name: "YouTube でハイライトを検索",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.youtube.com/results?search_query=Irish%20Rugby%20vs%20Les%20Bleus%202027%20highlights",
    );
  });

  it("formats round zero as a playoff qualifier in the subtitle", () => {
    render(
      <MatchHeader
        match={{
          ...match,
          round: 0,
        }}
      />,
    );

    expect(
      screen.getByText(/シックスネイションズ 2027 · プレーオフ予選/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Round 0/)).not.toBeInTheDocument();
  });

  it("formats standard rounds as Japanese round labels in the subtitle", () => {
    render(<MatchHeader match={match} />);

    expect(
      screen.getAllByText(/シックスネイションズ 2027 · 第1節/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Round 1/)).not.toBeInTheDocument();
  });

  it("allows long team names to wrap on mobile", () => {
    render(
      <MatchHeader
        match={{
          ...match,
          awayTeam: {
            ...match.awayTeam,
            name: "Northampton Saints RFC Extended Name",
          },
        }}
      />,
    );

    expect(
      screen.getByText("Northampton Saints RFC Extended Name"),
    ).toHaveClass(
      "max-w-[9rem]",
      "whitespace-normal",
      "break-words",
      "sm:truncate",
    );
  });

  it("links both team names to the new team pages", () => {
    render(<MatchHeader match={match} />);

    expect(screen.getAllByRole("link", { name: "Ireland" })[0]).toHaveAttribute(
      "href",
      "/teams/ireland",
    );
    expect(screen.getAllByRole("link", { name: "France" })[0]).toHaveAttribute(
      "href",
      "/teams/france",
    );
  });
});
