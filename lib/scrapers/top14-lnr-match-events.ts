import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedPlayerMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

const TOP14_ORIGIN = "https://top14.lnr.fr";

type TeamSide = ParsedPlayerMatchEvent["teamSide"];

type GameFact = {
  club: string;
  minute: number | null;
  player?: { firstName?: string; lastName?: string };
  score: [number, number];
  slugSubType: string;
  type: string;
};

function playerName(fact: GameFact): string {
  return [fact.player?.firstName, fact.player?.lastName]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .trim();
}

function teamSide(fact: GameFact): TeamSide {
  if (fact.club === "home" || fact.club === "away") {
    return fact.club;
  }

  throw new Error(`Unknown Top 14 game-fact club: ${fact.club}`);
}

function parseGameFacts(value: string): GameFact[] {
  const parsed: unknown = JSON.parse(value);

  if (!Array.isArray(parsed)) {
    throw new Error("Top 14 :game-facts must be an array");
  }

  return parsed.map((fact, index) => {
    if (
      !fact ||
      typeof fact !== "object" ||
      Array.isArray(fact) ||
      typeof fact.club !== "string" ||
      (typeof fact.minute !== "number" && fact.minute !== null) ||
      !Array.isArray(fact.score) ||
      fact.score.length !== 2 ||
      !fact.score.every((score: unknown) => typeof score === "number") ||
      typeof fact.slugSubType !== "string" ||
      typeof fact.type !== "string"
    ) {
      throw new Error(`Invalid Top 14 game-fact at index ${index}`);
    }

    return fact as GameFact;
  });
}

function eventType(fact: GameFact): ParsedPlayerMatchEvent["type"] {
  if (fact.type === "Point" && fact.slugSubType === "essai") {
    return "try";
  }
  if (fact.type === "Point" && fact.slugSubType === "essai-de-penalite") {
    return "try";
  }
  if (fact.type === "Point" && fact.slugSubType === "penalite") {
    return "penalty_goal";
  }
  if (fact.type === "Exclusion joueur" && fact.slugSubType === "jaune") {
    return "yellow_card";
  }
  if (fact.type === "Exclusion joueur" && fact.slugSubType === "rouge") {
    return "red_card";
  }
  if (fact.type === "Exclusion joueur" && fact.slugSubType === "orange") {
    return "red_card";
  }
  throw new Error(
    `Unknown Top 14 game-fact subtype: type=${fact.type} slugSubType=${fact.slugSubType}`,
  );
}

function isPenaltyTryFact(fact: GameFact): boolean {
  return fact.type === "Point" && fact.slugSubType === "essai-de-penalite";
}

function scoreEventsForIncrement(params: {
  fact: GameFact;
  factType: ParsedPlayerMatchEvent["type"];
  increment: number;
  scoreSide: TeamSide;
}): ParsedPlayerMatchEvent[] {
  const { fact, factType, increment, scoreSide } = params;
  const event = (
    type: ParsedPlayerMatchEvent["type"],
    playerName: string,
    isPenaltyTry = false,
  ) => ({
    isPenaltyTry,
    minute: fact.minute,
    playerName,
    source: "top14.lnr.fr",
    teamSide: scoreSide,
    type,
  });
  const isFactTeam = scoreSide === teamSide(fact);
  const isPenaltyTry = isFactTeam && isPenaltyTryFact(fact);

  if (isPenaltyTry && increment !== 7) {
    throw new Error(
      `Unexpected Top 14 score increment: ${increment} for ${scoreSide} at minute ${fact.minute ?? "unknown"}`,
    );
  }

  if (increment === 0) return [];

  if (increment === 2) {
    return [event("conversion", "")];
  }

  if (increment === 3) {
    return [
      event(
        "penalty_goal",
        isFactTeam && factType === "penalty_goal" ? playerName(fact) : "",
      ),
    ];
  }

  if (increment === 5) {
    return [
      event("try", isFactTeam && factType === "try" ? playerName(fact) : ""),
    ];
  }

  if (increment === 7) {
    const tryEvent = event(
      "try",
      isPenaltyTry
        ? ""
        : isFactTeam && factType === "try"
          ? playerName(fact)
          : "",
      isPenaltyTry,
    );

    if (isPenaltyTry) {
      return [tryEvent];
    }

    return [tryEvent, event("conversion", "")];
  }

  throw new Error(
    `Unexpected Top 14 score increment: ${increment} for ${scoreSide} at minute ${fact.minute ?? "unknown"}`,
  );
}

export function buildTop14LnrMatchEventsUrl(matchPath: string): string {
  const normalized = matchPath.startsWith("http")
    ? matchPath
    : new URL(matchPath, TOP14_ORIGIN).toString();
  const withoutTrailingSlash = normalized.replace(/\/+$/g, "");

  return withoutTrailingSlash.endsWith("/resumes-replays")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/resumes-replays`;
}

export function parseTop14LnrGameFactsHtml(
  html: string,
): ParsedPlayerMatchEvent[] {
  const encodedFacts = load(html)("header-timeline").attr(":game-facts");

  if (!encodedFacts) {
    throw new Error("Top 14 :game-facts is missing");
  }

  const facts = parseGameFacts(encodedFacts);
  const events: ParsedPlayerMatchEvent[] = [];
  let previousScore: [number, number] = [0, 0];

  for (const fact of facts) {
    const factType = eventType(fact);
    const factSide = teamSide(fact);

    for (const [index, scoreSide] of (["home", "away"] as const).entries()) {
      events.push(
        ...scoreEventsForIncrement({
          fact,
          factType,
          increment: fact.score[index]! - previousScore[index]!,
          scoreSide,
        }),
      );
    }

    if (factType === "yellow_card" || factType === "red_card") {
      events.push({
        isPenaltyTry: false,
        minute: fact.minute,
        playerName: playerName(fact),
        source: "top14.lnr.fr",
        teamSide: factSide,
        type: factType,
      });
    }

    previousScore = fact.score;
  }

  return events;
}

export async function fetchTop14LnrMatchEvents(
  matchPath: string,
): Promise<ParsedPlayerMatchEvent[]> {
  const response = await fetchWithPolicy(
    buildTop14LnrMatchEventsUrl(matchPath),
  );

  return parseTop14LnrGameFactsHtml(await response.text());
}
