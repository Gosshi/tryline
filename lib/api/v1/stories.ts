import { SITE_URL } from "@/lib/site";
import { truncateAtSentenceBoundary } from "@/lib/text";

import type { V1StoryItem } from "@/lib/api/v1/types";
import type { StorySourcedFact } from "@/lib/db/queries/sourced-facts";

export const MAX_NEWS_ITEMS_PER_MATCH = 3;

const JAPANESE_CHARACTER_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

type StoryNewsMatch = {
  awayTeam: { name: string };
  homeTeam: { name: string };
  id: string;
  kickoffAt: string;
};

function buildNewsImageUrls(
  matchId: string,
  publishedAt: string,
): V1StoryItem["image"] {
  const version = Math.max(
    0,
    Math.floor(new Date(publishedAt).getTime() / 1_000),
  );
  const base = `/api/og?type=story&match=${encodeURIComponent(
    matchId,
  )}&item=news&v=${version}`;

  return {
    landscape_url: `${SITE_URL}${base}&orientation=landscape`,
    portrait_url: `${SITE_URL}${base}&orientation=portrait`,
  };
}

function matchupTitle(match: StoryNewsMatch): string {
  return `${match.homeTeam.name} vs ${match.awayTeam.name}`;
}

export function buildNewsItems(
  match: StoryNewsMatch,
  facts: StorySourcedFact[],
  phase: "post" | "pre",
): V1StoryItem[] {
  const kickoffAt = new Date(match.kickoffAt).getTime();
  const latestFactByDomain = new Map<string, StorySourcedFact>();

  for (const fact of [...facts]
    .filter(
      (candidate) =>
        candidate.matchId === match.id &&
        (phase === "pre"
          ? candidate.contentType === "preview" ||
            candidate.contentType === "shared"
          : candidate.contentType === "recap") &&
        (phase === "pre"
          ? candidate.confidence === "high" || candidate.confidence === "medium"
          : candidate.confidence === "high") &&
        (JAPANESE_CHARACTER_PATTERN.test(candidate.fact) ||
          (typeof candidate.factJa === "string" &&
            candidate.factJa.trim().length > 0)) &&
        (phase === "post" ||
          new Date(candidate.fetchedAt).getTime() < kickoffAt),
    )
    .sort(
      (left, right) =>
        right.fetchedAt.localeCompare(left.fetchedAt) ||
        right.id.localeCompare(left.id),
    )) {
    if (!latestFactByDomain.has(fact.sourceDomain)) {
      latestFactByDomain.set(fact.sourceDomain, fact);
    }

    if (latestFactByDomain.size === MAX_NEWS_ITEMS_PER_MATCH) {
      break;
    }
  }

  return [...latestFactByDomain.values()]
    .sort(
      (left, right) =>
        left.fetchedAt.localeCompare(right.fetchedAt) ||
        left.id.localeCompare(right.id),
    )
    .map((fact) => ({
      contains_result: phase === "post",
      destination: {
        type: "match",
        url: `${SITE_URL}/matches/${match.id}`,
      },
      id: `${match.id}:news:${fact.id}`,
      image: buildNewsImageUrls(match.id, fact.fetchedAt),
      premium_required: false,
      published_at: fact.fetchedAt,
      source_domain: fact.sourceDomain,
      source_url: fact.sourceUrl,
      summary: truncateAtSentenceBoundary(fact.factJa ?? fact.fact, 160),
      title: `ニュース｜${matchupTitle(match)}`,
      type: "news",
    }));
}
