import { describe, expect, it } from "vitest";

import {
  getHomeReviewExcerpt,
  selectHomeBoardMatches,
  selectHomeReviews,
  selectHomeTickerMatches,
} from "@/lib/home-selection";

import type {
  CalendarMatch,
  RecentlyReviewedCompetitionGroup,
  RecentlyReviewedMatch,
} from "@/lib/db/queries/matches";

const now = new Date("2026-10-04T03:00:00.000Z");

function match(
  id: string,
  kickoffAt: string,
  status: CalendarMatch["status"] = "scheduled",
): CalendarMatch {
  return {
    id,
    kickoffAt,
    kickoffTimeTbd: false,
    status,
    competition: {
      family: "top-14",
      name: "Top 14",
      season: "2026-27",
      slug: "top-14-2026-27",
    },
    homeTeam: { slug: "toulouse", name: "トゥールーズ", shortCode: "TOU" },
    awayTeam: { slug: "montpellier", name: "モンペリエ", shortCode: "MHR" },
    homeScore: status === "finished" ? 40 : null,
    awayScore: status === "finished" ? 18 : null,
    hasPreview: false,
    hasRecap: status === "finished",
    hasBroadcasts: false,
    venue: null,
    round: 5,
    roundName: null,
    poolName: null,
  };
}

const future = (index: number) =>
  match(
    `future-${index}`,
    `2026-10-${String(index + 4).padStart(2, "0")}T10:00:00.000Z`,
  );
const result = (index: number) =>
  match(`result-${index}`, `2026-10-0${index}T01:00:00.000Z`, "finished");
const ids = (matches: { id: string }[]) => matches.map(({ id }) => id);

describe("selectHomeTickerMatches", () => {
  it("limits 20 inputs to eight, keeping recent results and next fixtures in order", () => {
    const results = Array.from({ length: 10 }, (_, index) =>
      match(
        `result-${index}`,
        new Date(now.getTime() - (index + 1) * 3600000).toISOString(),
        "finished",
      ),
    );
    const upcoming = Array.from({ length: 10 }, (_, index) =>
      match(
        `next-${index}`,
        new Date(now.getTime() + (index + 1) * 3600000).toISOString(),
      ),
    );
    const input = [...upcoming, ...results].reverse();
    const original = [...input];
    expect(ids(selectHomeTickerMatches(input, now))).toEqual([
      "result-0",
      "result-1",
      "result-2",
      "result-3",
      "next-0",
      "next-1",
      "next-2",
      "next-3",
    ]);
    expect(input).toEqual(original);
  });

  it.each(["finished", "scheduled"] as const)(
    "fills all eight slots when only %s matches exist",
    (status) => {
      const input = Array.from({ length: 20 }, (_, index) =>
        match(
          String(index),
          new Date(
            now.getTime() +
              (status === "finished" ? -1 : 1) * (index + 1) * 3600000,
          ).toISOString(),
          status,
        ),
      ).reverse();
      expect(ids(selectHomeTickerMatches(input, now))).toEqual(
        Array.from({ length: 8 }, (_, index) => String(index)),
      );
    },
  );

  it("deduplicates and excludes cancelled or already-started unfinished matches", () => {
    const input = [
      result(1),
      result(1),
      future(1),
      future(1),
      match("cancelled", future(1).kickoffAt, "cancelled"),
      match("live", now.toISOString(), "in_progress"),
    ];
    expect(ids(selectHomeTickerMatches(input, now))).toEqual([
      "result-1",
      "future-1",
    ]);
    expect(selectHomeTickerMatches([], now)).toEqual([]);
  });
});

describe("selectHomeBoardMatches", () => {
  it("takes the earliest four of six future weekly matches without changing the input", () => {
    const weekMatches = [6, 2, 5, 1, 4, 3].map(future);
    const original = [...weekMatches];
    expect(
      ids(selectHomeBoardMatches({ weekMatches, upcomingMatches: [], now })),
    ).toEqual(["future-1", "future-2", "future-3", "future-4"]);
    expect(weekMatches).toEqual(original);
  });

  it("fills one weekly fixture with the next three distinct upcoming fixtures", () => {
    const weekMatches = [future(1)];
    const upcomingMatches = [
      future(5),
      future(1),
      future(3),
      future(2),
      future(4),
    ];
    expect(
      ids(selectHomeBoardMatches({ weekMatches, upcomingMatches, now })),
    ).toEqual(["future-1", "future-2", "future-3", "future-4"]);
  });

  it("takes the latest four finished weekly matches when there are no future fixtures", () => {
    const weekMatches = [
      result(1),
      result(4),
      result(2),
      result(3),
      match("old-result", "2026-09-30T01:00:00.000Z", "finished"),
    ];
    expect(
      ids(selectHomeBoardMatches({ weekMatches, upcomingMatches: [], now })),
    ).toEqual(["result-4", "result-3", "result-2", "result-1"]);
  });

  it("returns no matches when both sources are empty so the page can fetch its fallback", () => {
    expect(
      selectHomeBoardMatches({ weekMatches: [], upcomingMatches: [], now }),
    ).toEqual([]);
  });

  it("keeps weekly future fixtures, then upcoming fixtures, then results in priority order", () => {
    expect(
      ids(
        selectHomeBoardMatches({
          weekMatches: [result(1), future(2), result(3), future(1)],
          upcomingMatches: [future(3)],
          now,
        }),
      ),
    ).toEqual(["future-1", "future-2", "future-3", "result-3"]);
  });

  it("deduplicates all sources and does not pad short data with an invented match", () => {
    const weekMatches = [future(1), future(1), result(3), result(3)];
    expect(
      ids(
        selectHomeBoardMatches({
          weekMatches,
          upcomingMatches: [future(1), future(2), future(2)],
          now,
        }),
      ),
    ).toEqual(["future-1", "future-2", "result-3"]);
  });

  it("does not treat already-started or cancelled weekly matches as finished results", () => {
    const weekMatches = [
      match("live", now.toISOString(), "in_progress"),
      match("cancelled", "2026-10-03T10:00:00.000Z", "cancelled"),
    ];
    expect(
      selectHomeBoardMatches({ weekMatches, upcomingMatches: [], now }),
    ).toEqual([]);
  });
});

function review(index: number): RecentlyReviewedMatch {
  return {
    ...result(index),
    recapGeneratedAt: `2026-10-0${index}T02:00:00.000Z`,
    recapExcerpt: "試合を振り返る最初の一文です。続きの一文です。",
  };
}

function group(
  hero: RecentlyReviewedMatch,
  compact: RecentlyReviewedMatch[] = [],
): RecentlyReviewedCompetitionGroup {
  return {
    hero,
    compact,
    competition: hero.competition,
    latestReviewAt: hero.recapGeneratedAt,
    round: 5,
    roundName: null,
    poolName: null,
  };
}

describe("selectHomeReviews", () => {
  it.each([0, 1, 2, 5])(
    "sorts %i reviews by generation time and selects at most three",
    (count) => {
      const reviews = Array.from({ length: count }, (_, index) =>
        review(index + 1),
      );
      const groups = count ? [group(reviews[0]!, reviews.slice(1))] : [];
      expect(ids(selectHomeReviews(groups))).toEqual(
        [...reviews]
          .reverse()
          .slice(0, 3)
          .map(({ id }) => id),
      );
      expect(groups[0]?.hero).toBe(reviews[0]);
    },
  );

  it("mixes heroes and compact reviews across competitions rather than sorting by group time", () => {
    const groups = [
      group(review(2), [review(5), review(1)]),
      group(review(4), [review(3)]),
    ];
    expect(ids(selectHomeReviews(groups))).toEqual([
      "result-5",
      "result-4",
      "result-3",
    ]);
  });

  it("does not show the same review twice", () => {
    expect(
      ids(
        selectHomeReviews([
          group(review(4), [review(4), review(3)]),
          group(review(3), [review(2)]),
        ]),
      ),
    ).toEqual(["result-4", "result-3", "result-2"]);
  });
});

describe("getHomeReviewExcerpt", () => {
  it.each([
    "この試合の核心",
    "試合全体像",
    "ターニングポイント",
    "注目選手",
    "大会文脈と順位への影響",
    "両チームの近況と戦術傾向",
    "次戦への示唆",
  ])("removes a leading recap section heading: %s", (heading) => {
    expect(
      getHomeReviewExcerpt(
        `${heading} エクセターが接点で優位に立った。続きです。`,
      ),
    ).toBe("エクセターが接点で優位に立った。");
  });

  it("removes the heading before applying the 60-character sentence limit", () => {
    expect(
      getHomeReviewExcerpt(
        "この試合の核心 " + "あ".repeat(59) + "。続きです。",
      ),
    ).toBe("あ".repeat(59) + "。");
    expect(
      getHomeReviewExcerpt("この試合の核心 " + "あ".repeat(61) + "。"),
    ).toBe("あ".repeat(59) + "…");
  });

  it("handles surrounding whitespace, line breaks and a heading without a body", () => {
    expect(
      getHomeReviewExcerpt("  この試合の核心\n\n本文です。続きです。  "),
    ).toBe("本文です。");
    expect(getHomeReviewExcerpt(" この試合の核心 ")).toBe("");
  });

  it("keeps heading words that belong to prose rather than a leading heading", () => {
    expect(
      getHomeReviewExcerpt("この試合の核心は接点にあった。続きです。"),
    ).toBe("この試合の核心は接点にあった。");
    expect(getHomeReviewExcerpt("接点がこの試合の核心だった。続きです。")).toBe(
      "接点がこの試合の核心だった。",
    );
  });

  it("shows only the first sentence", () => {
    expect(getHomeReviewExcerpt("最初の一文です。次の一文です。")).toBe(
      "最初の一文です。",
    );
    expect(getHomeReviewExcerpt("First sentence! Next sentence.")).toBe(
      "First sentence!",
    );
  });

  it("limits a long first sentence to 60 characters including the ellipsis", () => {
    expect(getHomeReviewExcerpt("あ".repeat(61) + "。続きです。")).toBe(
      "あ".repeat(59) + "…",
    );
    expect(Array.from(getHomeReviewExcerpt("🏉".repeat(61))).length).toBe(60);
  });

  it("keeps a short sentence or empty excerpt intact", () => {
    expect(getHomeReviewExcerpt("あ".repeat(59) + "。")).toBe(
      "あ".repeat(59) + "。",
    );
    expect(getHomeReviewExcerpt("  短い抜粋  ")).toBe("短い抜粋");
    expect(getHomeReviewExcerpt("")).toBe("");
  });
});
