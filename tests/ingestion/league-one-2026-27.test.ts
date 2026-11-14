import { load } from "cheerio";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => ({ fetchWithPolicy: vi.fn() }));
vi.mock("@/lib/scrapers/fetcher", () => fetcher);

import { LIVE_COMPETITION_SOURCES } from "@/lib/ingestion/live-competitions";
import {
  fetchLeagueOne202526,
  fetchLeagueOneSeason,
  parseLeagueOneLiveHtml,
} from "@/lib/ingestion/sources/league-one-live";

const html = readFileSync(
  "tests/fixtures/league-one-schedule-2026-27.html",
  "utf8",
);
const parse = (input = html) => parseLeagueOneLiveHtml(input, "2026-27");
function cards(division: number) {
  const $ = load(html);
  return $(".c-schedule")
    .toArray()
    .filter((e) =>
      new RegExp(`\\bDIVISION\\s*${division}\\b`, "i").test(
        $(e).find(".ttl-wrap .ttl").text(),
      ),
    )
    .map((e) => ({
      html: $.html(e),
      id: `match_${
        $(e)
          .find("a.btn-match-detail")
          .attr("href")
          ?.match(/match\/(\d+)/)?.[1]
      }`,
    }));
}

beforeEach(() => {
  fetcher.fetchWithPolicy.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("League One 2026-27 acceptance", () => {
  it("AC1: parses the real fixture without throwing", () => {
    expect(() => parse()).not.toThrow();
  });

  it("AC2: keeps announced kickoff times in JST", () => {
    expect(parse().find((m) => m.eventId === "match_31135")).toMatchObject({
      kickoffAt: "2026-12-12T03:00:00.000Z",
      kickoffTimeTbd: false,
    });
  });

  it("AC3: uses noon JST in the end year for Undecided", () => {
    const card = cards(1).find(
      (c) => /20\.02/.test(c.html) && /Undecided/.test(c.html),
    );
    expect(card).toBeDefined();
    expect(parse(card!.html)[0]).toMatchObject({
      kickoffAt: "2027-02-20T03:00:00.000Z",
      kickoffTimeTbd: true,
    });
  });

  it.each(["", "TBC"])("AC3: also accepts unknown time %j", (time) => {
    const $ = load(cards(1)[0]!.html);
    $(".time").text(time);
    expect(parse($.html())[0]).toMatchObject({
      kickoffAt: "2026-12-12T03:00:00.000Z",
      kickoffTimeTbd: true,
    });
  });

  it("AC4: resolves both renamed teams to their existing slugs", () => {
    const matches = parse();
    for (const [name, slug] of [
      ["TOCHIGI Honda HEAT", "honda-heat"],
      ["TOSHIBA BRAVE LUPUS MUSASHI", "toshiba-brave-lupus"],
    ]) {
      const involved = matches.filter(
        (m) => m.homeTeamName === name || m.awayTeamName === name,
      );
      expect(involved.length).toBeGreaterThan(0);
      for (const match of involved) {
        expect(
          match.homeTeamName === name ? match.homeTeamSlug : match.awayTeamSlug,
        ).toBe(slug);
      }
    }
  });

  it("AC5: returns 101 dated Division 1 cards with no unresolved names", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const matches = parse();
    expect(cards(1)).toHaveLength(108);
    expect(matches).toHaveLength(101);
    expect(error).not.toHaveBeenCalled();
    expect(matches.filter((m) => m.kickoffTimeTbd)).toHaveLength(48);
  });

  it("AC6: excludes Division 2 and 3 cards", () => {
    const ids = new Set(parse().map((m) => m.eventId));
    for (const division of [2, 3]) {
      expect(cards(division).length).toBeGreaterThan(0);
      for (const card of cards(division)) expect(ids.has(card.id)).toBe(false);
    }
  });

  it("AC7: drops unknown teams and logs distinct names once, excluding Division 2", () => {
    const $ = load(cards(1)[0]!.html);
    $(".home .name.only-pc, .away .name.only-pc").text("Unknown Test Club");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(parse($.html() + $.html())).toEqual([]);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      "[league-one-live] unresolved team names",
      { names: ["Unknown Test Club"], season: "2026-27" },
    );
    error.mockClear();
    $(".ttl").text("DIVISION 2 R1");
    expect(parse($.html())).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  it("AC8: skips all seven undated cards and warns once with their IDs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const matches = parse();
    const skippedIds = [
      "31194",
      "31217",
      "31218",
      "31224",
      "31223",
      "31230",
      "31229",
    ];
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[league-one-live] skipped cards without date",
      { matchIds: skippedIds, season: "2026-27" },
    );
    expect(matches).toHaveLength(101);
    expect(matches.map((m) => m.eventId).sort()).toEqual(
      cards(1)
        .map((c) => c.id)
        .filter((id) => !skippedIds.includes(id.replace("match_", "")))
        .sort(),
    );
  });

  it.each(["", "Undecided", "TBC"])(
    "AC8: skips unreadable date %j and uses the pairing when no match ID exists",
    (date) => {
      const $ = load(cards(1)[0]!.html);
      $(".date").text(date);
      $("a.btn-match-detail").remove();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(parse($.html())).toEqual([]);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        "[league-one-live] skipped cards without date",
        {
          matchIds: ["KOBELCO KOBE STEELERS vs TOYOTA VERBLITZ"],
          season: "2026-27",
        },
      );
    },
  );

  it("AC9: replaces the live source with 2026-27", async () => {
    expect(
      LIVE_COMPETITION_SOURCES.some(
        (s) => s.competitionSlug === "league-one-2025-26",
      ),
    ).toBe(false);
    const source = LIVE_COMPETITION_SOURCES.find(
      (s) => s.competitionSlug === "league-one-2026-27",
    );
    expect(source).toMatchObject({
      competitionName: "League One 2026-27",
      family: "league-one",
      season: "2026-27",
      sourceLabel: "league-one.jp",
    });
    fetcher.fetchWithPolicy.mockImplementation(async () => new Response(""));
    await source!.fetch();
    expect(fetcher.fetchWithPolicy).toHaveBeenCalledWith(
      "https://league-one.jp/en/schedule/?t1=3&year=2026",
    );
  });

  it("AC10: fetches both season URLs and accepts empty playoffs", async () => {
    fetcher.fetchWithPolicy.mockImplementation(
      async (url: string) =>
        new Response(url.includes("t1=3") ? html : "<html></html>"),
    );
    const matches = await fetchLeagueOneSeason("2026-27");
    expect(matches).toHaveLength(101);
    expect(fetcher.fetchWithPolicy.mock.calls).toEqual([
      ["https://league-one.jp/en/schedule/?t1=3&year=2026"],
      ["https://league-one.jp/en/schedule/?t1=0&year=2026"],
    ]);
  });

  it("AC11: preserves the legacy fetch wrapper", async () => {
    fetcher.fetchWithPolicy.mockImplementation(async () => new Response(""));
    expect(await fetchLeagueOne202526()).toEqual([]);
    expect(fetcher.fetchWithPolicy.mock.calls).toEqual([
      ["https://league-one.jp/en/schedule/?t1=3&year=2025"],
      ["https://league-one.jp/en/schedule/?t1=0&year=2025"],
    ]);
  });
});
