import { describe, expect, it } from "vitest";

import { pointsForMatchEvent } from "@/lib/format/match-event-points";
import {
  computeParsedMatchEventPointTotals,
  eventTotalsMatchFinalScore,
} from "@/lib/ingestion/event-integrity";
import {
  buildTop14LnrMatchEventsUrl,
  parseTop14LnrGameFactsHtml,
} from "@/lib/scrapers/top14-lnr-match-events";
import castresVannesFacts from "@/tests/fixtures/top14-lnr-11821-castres-vannes.json";
import perpignanCastresFacts from "@/tests/fixtures/top14-lnr-11826-perpignan-castres.json";
import clermontParisFacts from "@/tests/fixtures/top14-lnr-11828-clermont-paris.json";
import toulouseBordeauxFacts from "@/tests/fixtures/top14-lnr-11832-toulouse-bordeaux.json";

function fixtureHtml(facts: unknown) {
  return `<header-timeline :game-facts='${JSON.stringify(facts)}'></header-timeline>`;
}

function pointTotals(events: ReturnType<typeof parseTop14LnrGameFactsHtml>) {
  return events.reduce(
    (totals, event) => ({
      ...totals,
      [event.teamSide]: totals[event.teamSide] + pointsForMatchEvent(event),
    }),
    { away: 0, home: 0 },
  );
}

describe("Top 14 LNR match events", () => {
  it("builds the resumes-replays URL without double suffixes", () => {
    expect(
      buildTop14LnrMatchEventsUrl(
        "/feuille-de-match/2026-2027/j2/11832-toulouse-bordeaux-begles",
      ),
    ).toBe(
      "https://top14.lnr.fr/feuille-de-match/2026-2027/j2/11832-toulouse-bordeaux-begles/resumes-replays",
    );
    expect(
      buildTop14LnrMatchEventsUrl(
        "/feuille-de-match/2026-2027/j2/11832-toulouse-bordeaux-begles/resumes-replays",
      ),
    ).toBe(
      "https://top14.lnr.fr/feuille-de-match/2026-2027/j2/11832-toulouse-bordeaux-begles/resumes-replays",
    );
  });

  it("parses the real Clermont–Paris facts with derived anonymous conversions", () => {
    const events = parseTop14LnrGameFactsHtml(fixtureHtml(clermontParisFacts));

    expect(events).toHaveLength(13);
    expect(events.filter((event) => event.type === "try")).toHaveLength(4);
    expect(events.filter((event) => event.type === "conversion")).toHaveLength(
      3,
    );
    expect(
      events.filter((event) => event.type === "penalty_goal"),
    ).toHaveLength(5);
    expect(events.filter((event) => event.type === "yellow_card")).toHaveLength(
      1,
    );
    expect(
      events
        .filter((event) => event.type === "try")
        .map((event) => event.minute),
    ).toEqual([52, 63, 71, 73]);
    expect(
      events
        .filter((event) => event.type === "conversion")
        .map((event) => event.minute),
    ).toEqual([52, 63, 71]);
    expect(
      events
        .filter((event) => event.type === "conversion")
        .every((event) => event.playerName === ""),
    ).toBe(true);
    expect(
      events
        .filter((event) => event.type === "try")
        .every((event) => event.isPenaltyTry === false),
    ).toBe(true);
    expect(pointTotals(events)).toEqual({ away: 16, home: 25 });
    expect(events.find((event) => event.minute === 6)?.teamSide).toBe("away");
    expect(events.find((event) => event.minute === 16)?.teamSide).toBe("home");
  });

  it("parses real Toulouse–Bordeaux facts without changing added-time minutes", () => {
    const events = parseTop14LnrGameFactsHtml(
      fixtureHtml(toulouseBordeauxFacts),
    );

    expect(events.filter((event) => event.type === "try")).toHaveLength(10);
    expect(events.filter((event) => event.type === "conversion")).toHaveLength(
      5,
    );
    expect(
      events.filter((event) => event.type === "penalty_goal"),
    ).toHaveLength(0);
    expect(events.filter((event) => event.type === "yellow_card")).toHaveLength(
      0,
    );
    expect(events.some((event) => event.minute === 40)).toBe(true);
    expect(events.some((event) => event.minute === 80)).toBe(true);
    expect(
      events.some((event) => event.minute === 42 || event.minute === 83),
    ).toBe(false);
    expect(pointTotals(events)).toEqual({ away: 12, home: 48 });
  });

  it("derives every Perpignan–Castres score delta, including a conversion on a card fact", () => {
    const events = parseTop14LnrGameFactsHtml(
      fixtureHtml(perpignanCastresFacts),
    );

    expect(events).toHaveLength(23);
    expect(events.filter((event) => event.type === "try")).toHaveLength(10);
    expect(events.filter((event) => event.type === "conversion")).toHaveLength(
      8,
    );
    expect(
      events.filter((event) => event.type === "penalty_goal"),
    ).toHaveLength(2);
    expect(events.filter((event) => event.type === "yellow_card")).toHaveLength(
      3,
    );
    expect(
      events
        .filter((event) => event.type === "conversion")
        .map((event) => event.minute),
    ).toEqual([15, 19, 25, 31, 47, 52, 63, 75]);
    expect(pointTotals(events)).toEqual({ away: 29, home: 43 });
  });

  it("rejects an unsupported score increment on any game fact", () => {
    const invalid = structuredClone(perpignanCastresFacts);
    invalid[9]!.score = [30, 15];

    expect(() => parseTop14LnrGameFactsHtml(fixtureHtml(invalid))).toThrow(
      /1.*47/,
    );
  });

  it("rejects an unknown game-fact subtype instead of ignoring it", () => {
    const unknown = structuredClone(clermontParisFacts);
    unknown[0]!.slugSubType = "drop-inconnu";

    expect(() => parseTop14LnrGameFactsHtml(fixtureHtml(unknown))).toThrow(
      /Point.*drop-inconnu/,
    );
  });

  it("parses LNR red-card facts", () => {
    const factsWithRedCard = structuredClone(clermontParisFacts);
    const redCardFact = factsWithRedCard[3]!;
    redCardFact.slugSubType = "rouge";

    const events = parseTop14LnrGameFactsHtml(fixtureHtml(factsWithRedCard));

    expect(events).toContainEqual(
      expect.objectContaining({
        minute: redCardFact.minute,
        playerName: "Tanginoa Palu HALAIFONUA",
        teamSide: redCardFact.club,
        type: "red_card",
      }),
    );
  });

  it("parses LNR orange-card facts without changing score totals", () => {
    const factsWithOrangeCard = structuredClone(clermontParisFacts);
    const orangeCardFact = factsWithOrangeCard[3]!;
    orangeCardFact.slugSubType = "orange";

    const events = parseTop14LnrGameFactsHtml(fixtureHtml(factsWithOrangeCard));

    expect(events).toContainEqual(
      expect.objectContaining({
        minute: orangeCardFact.minute,
        playerName: "Tanginoa Palu HALAIFONUA",
        teamSide: orangeCardFact.club,
        type: "red_card",
      }),
    );
    expect(pointTotals(events)).toEqual(
      pointTotals(parseTop14LnrGameFactsHtml(fixtureHtml(clermontParisFacts))),
    );
  });

  it("parses the real Castres–Vannes penalty try as one seven-point try", () => {
    const events = parseTop14LnrGameFactsHtml(fixtureHtml(castresVannesFacts));
    const penaltyTryEvents = events.filter(
      (event) =>
        event.minute === 31 &&
        event.teamSide === "home",
    );

    expect(penaltyTryEvents).toEqual([
      expect.objectContaining({
        isPenaltyTry: true,
        minute: 31,
        playerName: "n.a.",
        teamSide: "home",
        type: "try",
      }),
    ]);
  });

  it("does not derive a conversion for the real Castres–Vannes penalty try", () => {
    const events = parseTop14LnrGameFactsHtml(fixtureHtml(castresVannesFacts));

    expect(
      events.filter(
        (event) =>
          event.minute === 31 &&
          event.teamSide === "home" &&
          event.type === "conversion",
      ),
    ).toHaveLength(0);
  });

  it("keeps Castres–Vannes point totals equal to the final score", () => {
    const events = parseTop14LnrGameFactsHtml(fixtureHtml(castresVannesFacts));

    expect(computeParsedMatchEventPointTotals(events)).toEqual({
      away: 20,
      home: 29,
    });
    expect(
      eventTotalsMatchFinalScore(
        computeParsedMatchEventPointTotals(events),
        { away_score: 20, home_score: 29 },
      ),
    ).toBe(true);
  });

  it("rejects a penalty try whose own score increment is not seven", () => {
    const invalid = structuredClone(castresVannesFacts);
    const penaltyTryFact = invalid.find(
      (fact) => fact.slugSubType === "essai-de-penalite",
    );

    if (!penaltyTryFact) throw new Error("Penalty try fixture is missing");

    penaltyTryFact.score = [8, 3];

    expect(() => parseTop14LnrGameFactsHtml(fixtureHtml(invalid))).toThrow(
      /5.*31/,
    );
  });

  it("rejects a try whose score increment is not five or seven", () => {
    const invalid = structuredClone(toulouseBordeauxFacts);
    invalid[0]!.score = [6, 0];

    expect(() => parseTop14LnrGameFactsHtml(fixtureHtml(invalid))).toThrow(
      /Unexpected Top 14 score increment/,
    );
  });
});
