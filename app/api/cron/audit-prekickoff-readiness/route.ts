import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { CronUnauthorizedError, assertCronAuthorized } from "@/lib/cron/auth";
import { getMatchesInRange } from "@/lib/db/queries/matches";
import { getSupabaseServerClient } from "@/lib/db/server";
import { formatKickoffJst } from "@/lib/format/kickoff";
import {
  notifyPrekickoffReadinessAudit,
  type PrekickoffReadinessIssue,
} from "@/lib/llm/notify";

import type { Json } from "@/lib/db/types";

const AUDIT_WINDOW_HOURS = 36;

function hasWikipediaUrl(externalIds: Json): boolean {
  return Boolean(
    externalIds &&
      !Array.isArray(externalIds) &&
      typeof externalIds === "object" &&
      typeof externalIds.wikipedia_url === "string" &&
      externalIds.wikipedia_url.length > 0,
  );
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL);
    }

    throw error;
  }

  const now = new Date();
  const matches = (await getMatchesInRange(
    now.toISOString(),
    new Date(now.getTime() + AUDIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString(),
  )).filter((match) => match.status === "scheduled");
  const matchIds = matches.map((match) => match.id);

  if (matchIds.length === 0) {
    return apiSuccess({ audited: 0, issues: 0 }, PRIVATE_CACHE_CONTROL);
  }

  const db = getSupabaseServerClient();
  const [contentResult, factsResult, lineupsResult, matchResult] =
    await Promise.all([
      db
        .from("match_content")
        .select("match_id, status")
        .in("match_id", matchIds)
        .eq("content_type", "preview")
        .eq("language", "ja"),
      db
        .from("match_sourced_facts")
        .select("match_id")
        .in("match_id", matchIds)
        .eq("content_type", "preview"),
      db.from("match_lineups").select("match_id").in("match_id", matchIds),
      db
        .from("matches")
        .select("id, external_ids")
        .in("id", matchIds),
    ]);

  for (const result of [contentResult, factsResult, lineupsResult, matchResult]) {
    if (result.error) {
      throw result.error;
    }
  }

  const contentByMatchId = new Map<string, Set<string>>();
  for (const content of contentResult.data ?? []) {
    const statuses = contentByMatchId.get(content.match_id) ?? new Set<string>();
    statuses.add(content.status);
    contentByMatchId.set(content.match_id, statuses);
  }
  const factMatchIds = new Set((factsResult.data ?? []).map((fact) => fact.match_id));
  const lineupMatchIds = new Set(
    (lineupsResult.data ?? []).map((lineup) => lineup.match_id),
  );
  const wikipediaUrlByMatchId = new Map(
    (matchResult.data ?? []).map((match) => [
      match.id,
      hasWikipediaUrl(match.external_ids),
    ]),
  );

  const issues: PrekickoffReadinessIssue[] = [];
  for (const match of matches) {
    const contentStatuses = contentByMatchId.get(match.id) ?? new Set<string>();

    if (contentStatuses.has("published")) {
      continue;
    }

    const matchIssues = ["プレビュー未公開"];
    if (contentStatuses.has("draft")) {
      matchIssues.push("draft滞留");
    }
    if (
      !lineupMatchIds.has(match.id) &&
      wikipediaUrlByMatchId.get(match.id) === true
    ) {
      matchIssues.push("ラインアップ未取り込み");
    }
    if (!factMatchIds.has(match.id)) {
      matchIssues.push("sourced_facts 0件");
    }

    issues.push({
      issues: matchIssues,
      kickoffAtJst: formatKickoffJst(match.kickoffAt),
      matchId: match.id,
      matchLabel: `${match.homeTeam.name} 対 ${match.awayTeam.name}`,
    });
  }

  if (issues.length > 0) {
    await notifyPrekickoffReadinessAudit(issues);
  }

  return apiSuccess(
    { audited: matches.length, issues: issues.length },
    PRIVATE_CACHE_CONTROL,
  );
}
