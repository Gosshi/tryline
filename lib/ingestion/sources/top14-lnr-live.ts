import {
  fetchTop14LnrCurrentRoundSlug,
  fetchTop14LnrRoundResultsWithDiagnostics,
} from "@/lib/scrapers/top14-lnr-results";

import type { LiveSourceFetchResult } from "@/lib/ingestion/live-ingest";
import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { Top14LnrMatchResult } from "@/lib/scrapers/top14-lnr-results";

export const TOP14_LNR_SEASON = "2026-27";

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

export function getTop14LnrForwardRoundSlugs(currentRoundSlug: string) {
  const matched = currentRoundSlug.match(/^j([1-9]|1\d|2[0-6])$/);

  if (!matched) {
    return [];
  }

  const currentRound = Number(matched[1]);
  return [currentRound, currentRound + 1, currentRound + 2]
    .filter((round) => round >= 1 && round <= 26)
    .map(toRoundSlug);
}

export async function getDefaultTop14LnrRoundSlugs() {
  return getTop14LnrForwardRoundSlugs(
    await fetchTop14LnrCurrentRoundSlug(TOP14_LNR_SEASON),
  );
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
  const waitBetweenRounds = options.waitBetweenRounds ?? wait;
  const usesCurrentRound = options.roundSlugs === undefined;
  const roundSlugs = options.roundSlugs ?? (await getDefaultTop14LnrRoundSlugs());

  validateRoundSlugs(roundSlugs);

  const results: Top14LnrMatchResult[] = [];
  const unknownTeamNames = new Set<string>();

  if (usesCurrentRound && roundSlugs.length > 0) {
    await waitBetweenRounds(TOP14_LNR_ROUND_DELAY_MS);
  }

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
