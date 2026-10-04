import type {
  CalendarMatch,
  RecentlyReviewedCompetitionGroup,
  RecentlyReviewedMatch,
  UpcomingMatch,
} from "@/lib/db/queries/matches";

export type HomeBoardMatch = UpcomingMatch &
  Partial<Pick<CalendarMatch, "hasPreview" | "hasRecap">>;

export function selectHomeBoardMatches({
  weekMatches,
  upcomingMatches,
  now,
}: {
  weekMatches: readonly CalendarMatch[];
  upcomingMatches: readonly UpcomingMatch[];
  now: Date;
}): HomeBoardMatch[] {
  const kickoff = (match: UpcomingMatch) => new Date(match.kickoffAt).getTime();
  const futureWeek = weekMatches
    .filter((match) => kickoff(match) > now.getTime())
    .sort((left, right) => kickoff(left) - kickoff(right));
  const upcoming = [...upcomingMatches].sort(
    (left, right) => kickoff(left) - kickoff(right),
  );
  const results = weekMatches
    .filter((match) => match.status === "finished")
    .sort((left, right) => kickoff(right) - kickoff(left));
  const selected: HomeBoardMatch[] = [];
  const seen = new Set<string>();
  for (const match of [...futureWeek, ...upcoming, ...results]) {
    if (seen.has(match.id)) continue;
    selected.push(match);
    seen.add(match.id);
    if (selected.length === 4) break;
  }
  return selected;
}

export function selectHomeReviews(
  groups: readonly RecentlyReviewedCompetitionGroup[],
): RecentlyReviewedMatch[] {
  const sorted = groups
    .flatMap((group) => [group.hero, ...group.compact])
    .sort(
      (left, right) =>
        new Date(right.recapGeneratedAt).getTime() -
        new Date(left.recapGeneratedAt).getTime(),
    );
  const seen = new Set<string>();
  return sorted
    .filter((match) => {
      if (seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    })
    .slice(0, 3);
}

export function getHomeReviewExcerpt(excerpt: string): string {
  // recapExcerpt is plain text: stripMarkdown leaves section-heading words.
  const text = excerpt
    .trim()
    .replace(
      /^(?:この試合の核心|試合全体像|ターニングポイント|注目選手|大会文脈と順位への影響|両チームの近況と戦術傾向|次戦への示唆)(?:\s+|$)/u,
      "",
    );
  const firstSentence = text.match(/^.*?[。！？.!?]/u)?.[0] ?? text;
  const characters = Array.from(firstSentence);
  return characters.length <= 60
    ? firstSentence
    : `${characters.slice(0, 59).join("")}…`;
}
