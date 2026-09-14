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
  if (fact.type === "Point" && fact.slugSubType === "penalite") {
    return "penalty_goal";
  }
  if (fact.type === "Exclusion joueur" && fact.slugSubType === "jaune") {
    return "yellow_card";
  }

  throw new Error(
    `Unknown Top 14 game-fact subtype: type=${fact.type} slugSubType=${fact.slugSubType}`,
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
    const type = eventType(fact);
    const side = teamSide(fact);

    if (type === "try") {
      const scoreIndex = side === "home" ? 0 : 1;
      const increment = fact.score[scoreIndex] - previousScore[scoreIndex];

      if (increment !== 5 && increment !== 7) {
        throw new Error(
          `Unexpected try score increment: ${increment} for ${side} at minute ${fact.minute ?? "unknown"}`,
        );
      }

      events.push({
        isPenaltyTry: false,
        minute: fact.minute,
        playerName: playerName(fact),
        source: "top14.lnr.fr",
        teamSide: side,
        type,
      });

      if (increment === 7) {
        events.push({
          isPenaltyTry: false,
          minute: fact.minute,
          playerName: "",
          source: "top14.lnr.fr",
          teamSide: side,
          type: "conversion",
        });
      }
    } else {
      events.push({
        isPenaltyTry: false,
        minute: fact.minute,
        playerName: playerName(fact),
        source: "top14.lnr.fr",
        teamSide: side,
        type,
      });
    }

    previousScore = fact.score;
  }

  return events;
}

export async function fetchTop14LnrMatchEvents(
  matchPath: string,
): Promise<ParsedPlayerMatchEvent[]> {
  const response = await fetchWithPolicy(buildTop14LnrMatchEventsUrl(matchPath));

  return parseTop14LnrGameFactsHtml(await response.text());
}
