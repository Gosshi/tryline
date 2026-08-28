import {
  fetchTop14LnrRoundResultsWithDiagnostics,
} from "@/lib/scrapers/top14-lnr-results";

import type { LiveSourceFetchResult } from "@/lib/ingestion/live-ingest";
import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { Top14LnrMatchResult } from "@/lib/scrapers/top14-lnr-results";

const TOP14_LNR_SEASON = "2026-27";
const TOP14_REGULAR_SEASON_STARTS_AT = new Date("2026-09-05T00:00:00.000Z");
const TOP14_REGULAR_SEASON_ENDS_AT = new Date("2027-06-13T00:00:00.000Z");

export const MAX_TOP14_LNR_ROUNDS_PER_INGEST = 3;
export const TOP14_LNR_ROUND_DELAY_MS = 3_000;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toRoundSlug(round: number) {
  return `j${round}`;
}

export function getDefaultTop14LnrRoundSlugs(now = new Date()) {
  if (now < TOP14_REGULAR_SEASON_STARTS_AT) {
    return ["j1", "j2"];
  }

  if (now > TOP14_REGULAR_SEASON_ENDS_AT) {
    return [];
  }

  const elapsedWeeks = Math.floor(
    (now.getTime() - TOP14_REGULAR_SEASON_STARTS_AT.getTime()) /
      (7 * 24 * 60 * 60 * 1_000),
  );
  const currentRound = Math.min(26, Math.max(1, elapsedWeeks + 1));

  return [currentRound - 1, currentRound, currentRound + 1]
    .filter((round) => round >= 1 && round <= 26)
    .map(toRoundSlug);
}

function validateRoundSlugs(roundSlugs: string[]) {
  if (roundSlugs.length > MAX_TOP14_LNR_ROUNDS_PER_INGEST) {
    throw new Error(
      `Top 14 live ingest accepts at most ${MAX_TOP14_LNR_ROUNDS_PER_INGEST} rounds per execution.`,
    );
  }

  for (const roundSlug of roundSlugs) {
    if (!/^j(?:[1-9]|1\d|2[0-6])$/.test(roundSlug)) {
      throw new Error(`Unsupported Top 14 regular-season round: ${roundSlug}`);
    }
  }
}

export function toParsedTop14LnrLiveMatches(
  results: Top14LnrMatchResult[],
): ParsedLiveMatch[] {
  return results.map((result) => ({
    awayScore: result.away_score,
    awayTeamName: result.away_team_slug,
    awayTeamSlug: result.away_team_slug,
    eventId: null,
    externalIds: {
      top14_lnr_id: result.lnr_id,
      top14_lnr_match_path: result.lnr_match_path,
      top14_lnr_round_slug: result.round_slug,
      top14_lnr_url: result.source_url,
    },
    homeScore: result.home_score,
    homeTeamName: result.home_team_slug,
    homeTeamSlug: result.home_team_slug,
    kickoffAt: result.kickoff_at,
    lineupTableHtml: null,
    rawHtml: "",
    round: result.round,
    roundName: null,
    status: result.status,
    venue: result.venue,
    wikipediaUrl: null,
  }));
}

export async function fetchTop14LnrLiveMatches(options: {
  roundSlugs?: string[];
  waitBetweenRounds?: (ms: number) => Promise<void>;
} = {}): Promise<LiveSourceFetchResult> {
  const roundSlugs = options.roundSlugs ?? getDefaultTop14LnrRoundSlugs();
  const waitBetweenRounds = options.waitBetweenRounds ?? wait;

  validateRoundSlugs(roundSlugs);

  const results: Top14LnrMatchResult[] = [];
  const unknownTeamNames = new Set<string>();

  for (const [index, roundSlug] of roundSlugs.entries()) {
    const parsed = await fetchTop14LnrRoundResultsWithDiagnostics(
      TOP14_LNR_SEASON,
      roundSlug,
    );
    results.push(...parsed.matches);
    parsed.unknownTeamNames.forEach((name) => unknownTeamNames.add(name));

    if (index < roundSlugs.length - 1) {
      await waitBetweenRounds(TOP14_LNR_ROUND_DELAY_MS);
    }
  }

  const names = [...unknownTeamNames].sort();

  return {
    matches: toParsedTop14LnrLiveMatches(results),
    unknownTeamNames: names,
  };
}
