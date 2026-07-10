import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { getSupabaseServerClient } from "@/lib/db/server";

export type SampleMatchCandidate = {
  awayScore: number | null;
  competitionFamily: string;
  kickoffAt: string;
  homeScore: number | null;
  id: string;
};

type SampleMatchRow = {
  match_id: string;
};

type SampleMatchCandidateRow = {
  match: {
    away_score: number | null;
    competition: { family: string | null } | null;
    home_score: number | null;
    id: string;
    kickoff_at: string;
  } | null;
};

const SAMPLE_MATCH_LIMIT = 8;
const MAX_PER_FAMILY = 2;

function scoreCandidate(candidate: SampleMatchCandidate): number {
  const margin =
    candidate.homeScore !== null && candidate.awayScore !== null
      ? Math.abs(candidate.homeScore - candidate.awayScore)
      : 99;

  return Date.parse(candidate.kickoffAt) / 1000 - margin * 3600;
}

export function selectSampleMatchIds(
  candidates: SampleMatchCandidate[],
  limit = SAMPLE_MATCH_LIMIT,
): string[] {
  const sorted = [...candidates].sort(
    (left, right) => scoreCandidate(right) - scoreCandidate(left),
  );
  const selected: SampleMatchCandidate[] = [];
  const familyCounts = new Map<string, number>();

  for (const candidate of sorted) {
    const count = familyCounts.get(candidate.competitionFamily) ?? 0;

    if (count >= MAX_PER_FAMILY) {
      continue;
    }

    selected.push(candidate);
    familyCounts.set(candidate.competitionFamily, count + 1);

    if (selected.length >= limit) {
      return selected.map((match) => match.id);
    }
  }

  for (const candidate of sorted) {
    if (selected.some((match) => match.id === candidate.id)) {
      continue;
    }

    selected.push(candidate);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected.map((match) => match.id);
}

export async function listCachedSampleMatchIds(): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("sample_matches")
    .select("match_id")
    .order("rank", { ascending: true })
    .limit(SAMPLE_MATCH_LIMIT);

  if (error) {
    throw error;
  }

  return ((data ?? []) as SampleMatchRow[]).map((row) => row.match_id);
}

export async function listSampleMatchCandidates(
  since: Date,
): Promise<SampleMatchCandidate[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        match:matches!inner (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          competition:competitions!matches_competition_id_fkey (
            family
          )
        )
      `,
    )
    .eq("content_type", "recap")
    .eq("language", "ja")
    .eq("status", "published")
    .eq("match.status", "finished")
    .gte("match.kickoff_at", since.toISOString())
    .order("generated_at", { ascending: false })
    .limit(80);

  if (error) {
    throw error;
  }

  return ((data ?? []) as SampleMatchCandidateRow[])
    .map((row) => row.match)
    .filter((match): match is NonNullable<SampleMatchCandidateRow["match"]> =>
      Boolean(match?.competition?.family),
    )
    .map((match) => ({
      awayScore: match.away_score,
      competitionFamily: match.competition?.family ?? "unknown",
      homeScore: match.home_score,
      id: match.id,
      kickoffAt: match.kickoff_at,
    }));
}

export async function replaceCachedSampleMatches(matchIds: string[]) {
  const client = getSupabaseServerClient();
  const selectedAt = new Date().toISOString();
  const { error: deleteError } = await client
    .from("sample_matches")
    .delete()
    .gte("rank", 0);

  if (deleteError) {
    throw deleteError;
  }

  if (matchIds.length === 0) {
    return;
  }

  const { error: insertError } = await client.from("sample_matches").insert(
    matchIds.map((matchId, index) => ({
      match_id: matchId,
      rank: index + 1,
      selected_at: selectedAt,
      selection_reason: "recent_published_recap_balanced_by_competition",
    })),
  );

  if (insertError) {
    throw insertError;
  }
}
