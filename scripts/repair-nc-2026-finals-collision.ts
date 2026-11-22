/** Read-only. Prints proposed SQL; never executes SQL or applies upserts.
 * node --env-file=.env.production.local tools/run-ts.cjs scripts/repair-nc-2026-finals-collision.ts
 */
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { getServerEnv } from "@/lib/env";
import { parseNationsChampionshipLiveHtml } from "@/lib/ingestion/sources/wikipedia-nations-championship";
import { fetchNationsChampionship2026KickoffTimes } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";
import { planMatchUpserts } from "@/lib/ingestion/upsert";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { Database, Json } from "@/lib/db/types";
import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { WorldRugbyNationsChampionshipTime } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";
import type {
  ExistingMatch,
  MatchUpsertPlan,
  ResolvedMatchCandidate,
} from "@/lib/ingestion/upsert";

const WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/2026_Nations_Championship";
const TARGET_PREFIXES = ["452acd61", "8461c743", "7cf4f5ed", "f00294b4"];
type Team = { id: string; slug: string };
type Repair = {
  id: string;
  home: string;
  away: string;
  action: "restore" | "duplicate";
  before: ExistingMatch;
  restored: ExistingMatch;
  canonicalId: string;
};
function object(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected external_ids object");
  return value as Record<string, Json>;
}
function unique<T>(rows: T[], label: string): T {
  if (rows.length !== 1)
    throw new Error(`Expected exactly one ${label}, found ${rows.length}`);
  return rows[0]!;
}
export function buildRepairs(
  rows: ExistingMatch[],
  teams: Team[],
  times: WorldRugbyNationsChampionshipTime[],
): Repair[] {
  const slug = (id: string) =>
    unique(
      teams.filter((team) => team.id === id),
      "team",
    ).slug;
  return TARGET_PREFIXES.map((prefix) => {
    const before = unique(
      rows.filter((row) => row.id.startsWith(prefix)),
      `row ${prefix}`,
    );
    const home = slug(before.home_team_id),
      away = slug(before.away_team_id);
    const time = unique(
      times.filter(
        (time) =>
          time.homeTeamSlug === home &&
          time.awayTeamSlug === away &&
          time.round !== 7,
      ),
      `past kickoff for ${home}:${away}`,
    );
    const duplicate = prefix === "f00294b4";
    const canonical = duplicate
      ? unique(
          rows.filter(
            (row) =>
              row.id.startsWith("e249c5a0") &&
              row.home_team_id === before.home_team_id &&
              row.away_team_id === before.away_team_id,
          ),
          "canonical Italy fixture",
        )
      : before;
    return {
      id: before.id,
      home,
      away,
      action: duplicate ? "duplicate" : "restore",
      before,
      canonicalId: canonical.id,
      restored: {
        ...canonical,
        kickoff_at: time.kickoffAt,
        kickoff_time_tbd: false,
        venue: time.venue ?? canonical.venue,
        external_ids: {
          ...object(canonical.external_ids),
          wikipedia_round: time.round,
          wikipedia_event_id: `round_${time.round}_${home.replaceAll("-", "_")}_v_${away.replaceAll("-", "_")}`,
        },
      },
    };
  });
}
export function resolveCandidates(
  matches: ParsedLiveMatch[],
  competitionId: string,
  teams: Team[],
): ResolvedMatchCandidate[] {
  return matches.map((match) => ({
    competitionId,
    homeTeamId: unique(
      teams.filter((team) => team.slug === match.homeTeamSlug),
      "home team",
    ).id,
    awayTeamId: unique(
      teams.filter((team) => team.slug === match.awayTeamSlug),
      "away team",
    ).id,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    kickoffAt: match.kickoffAt,
    kickoffTimeTbd: match.kickoffTimeTbd,
    status: match.status,
    venue: match.venue,
    externalIds: {
      ...match.externalIds,
      source: "wikipedia",
      ...(match.eventId ? { wikipedia_event_id: match.eventId } : {}),
      ...(match.wikipediaUrl ? { wikipedia_url: match.wikipediaUrl } : {}),
      ...(match.round != null ? { wikipedia_round: match.round } : {}),
      ...(match.roundName ? { round_name: match.roundName } : {}),
    },
  }));
}
function sqlString(value: string | null): string {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}
export function repairSql(repair: Repair): string {
  if (repair.action === "duplicate") {
    return `SELECT ${sqlString(repair.id)} AS duplicate_match_id, (SELECT count(*) FROM public.match_content WHERE match_id = ${sqlString(repair.id)}) AS match_content_count, (SELECT count(*) FROM public.match_events WHERE match_id = ${sqlString(repair.id)}) AS match_events_count, (SELECT count(*) FROM public.match_lineups WHERE match_id = ${sqlString(repair.id)}) AS match_lineups_count;`;
  }
  return `UPDATE public.matches SET kickoff_at = ${sqlString(repair.restored.kickoff_at)}, kickoff_time_tbd = false, venue = ${sqlString(repair.restored.venue)}, external_ids = ${sqlString(JSON.stringify(repair.restored.external_ids))}::jsonb WHERE id = ${sqlString(repair.id)} AND kickoff_at = ${sqlString(repair.before.kickoff_at)} AND external_ids = ${sqlString(JSON.stringify(repair.before.external_ids))}::jsonb;`;
}
export function summarizePlan(plan: MatchUpsertPlan, teams: Team[]) {
  const slug = (id: string) =>
    unique(
      teams.filter((team) => team.id === id),
      "plan team",
    ).slug;
  return plan.map((entry) => ({
    operation: entry.operation,
    id: entry.existing?.id ?? null,
    home: slug(entry.candidate.homeTeamId),
    away: slug(entry.candidate.awayTeamId),
    kickoffAt: entry.candidate.kickoffAt,
    round: entry.candidate.externalIds.wikipedia_round,
    status: entry.candidate.status,
    changes: entry.changes,
  }));
}
export function historicalUpdateViolations(plan: MatchUpsertPlan) {
  const kickoffChanges: MatchUpsertPlan = [];
  const otherChanges: MatchUpsertPlan = [];
  for (const entry of plan) {
    if (entry.operation !== "update" || entry.existing?.status !== "finished") {
      continue;
    }
    const { kickoff_at: kickoff, ...other } = entry.changes;
    if (kickoff) {
      const before =
        typeof kickoff.before === "string" ? Date.parse(kickoff.before) : NaN;
      const after =
        typeof kickoff.after === "string" ? Date.parse(kickoff.after) : NaN;
      if (before !== after) kickoffChanges.push(entry);
    }

    const ids = other.external_ids;
    if (entry.existing.id === "e249c5a0-d438-4f61-87f2-18a1c4421e53" && ids) {
      const before = object(ids.before);
      const after = object(ids.after);
      if (
        before.wikipedia_event_id === "mwBEU" &&
        isDeepStrictEqual(after, {
          ...before,
          wikipedia_event_id: "round_6_italy_v_fiji",
        })
      ) {
        delete other.external_ids;
      }
    }
    if (Object.keys(other).length > 0) otherChanges.push(entry);
  }
  return { kickoffChanges, otherChanges };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length)
    throw new Error("This script accepts no flags and has no write mode");
  const env = getServerEnv();
  let writeAttempts = 0;
  const db = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (input, init) => {
          const method =
            init?.method ?? (input instanceof Request ? input.method : "GET");
          if (!["GET", "HEAD"].includes(method.toUpperCase())) {
            writeAttempts += 1;
            throw new Error("Repair dry-run forbids database writes");
          }
          return fetch(input, init);
        },
      },
    },
  );
  const { data: competition, error: competitionError } = await db
    .from("competitions")
    .select("id")
    .eq("slug", "nations-championship-2026")
    .single();
  if (competitionError || !competition)
    throw new Error("Could not read Nations Championship competition");
  const [rowResult, teamResult, response, times] = await Promise.all([
    db
      .from("matches")
      .select(
        "id, competition_id, home_team_id, away_team_id, kickoff_at, kickoff_time_tbd, status, venue, home_score, away_score, external_ids",
      )
      .eq("competition_id", competition.id),
    db
      .from("teams")
      .select("id, slug")
      .in("slug", [
        "argentina",
        "australia",
        "england",
        "fiji",
        "france",
        "ireland",
        "italy",
        "japan",
        "new-zealand",
        "scotland",
        "south-africa",
        "wales",
      ]),
    fetchWithPolicy(WIKIPEDIA_URL),
    fetchNationsChampionship2026KickoffTimes(),
  ]);
  if (rowResult.error || teamResult.error)
    throw new Error("Could not read repair snapshot");
  const rows = rowResult.data,
    teams = teamResult.data;
  const matches = parseNationsChampionshipLiveHtml(
    await response.text(),
    times,
    WIKIPEDIA_URL,
  );
  if (!matches.length)
    throw new Error("Wikipedia returned no matches; no repair output produced");
  const candidates = resolveCandidates(matches, competition.id, teams);
  const repairs = buildRepairs(rows, teams, times);
  const beforePlan = await planMatchUpserts(candidates, {
    existingMatches: rows,
  });
  const repairedRows = rows.flatMap((row) => {
    const repair = repairs.find((repair) => repair.id === row.id);
    return repair?.action === "duplicate" ? [] : [repair?.restored ?? row];
  });
  const afterPlan = await planMatchUpserts(candidates, {
    existingMatches: repairedRows,
  });
  const duplicate = unique(
    repairs.filter((repair) => repair.action === "duplicate"),
    "duplicate repair",
  );
  const dependencies = await Promise.all(
    (["match_content", "match_events", "match_lineups"] as const).map(
      async (table) => {
        const { count, error } = await db
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("match_id", duplicate.id);
        if (error)
          throw new Error(`Could not read dependency count for ${table}`);
        return { table, count };
      },
    ),
  );
  const finals = afterPlan.filter(
    (entry) => entry.candidate.externalIds.wikipedia_round === 7,
  );
  const { kickoffChanges, otherChanges } =
    historicalUpdateViolations(afterPlan);
  const finalPairs = new Set([
    "ireland:australia",
    "scotland:argentina",
    "wales:japan",
    "england:new-zealand",
    "france:south-africa",
    "italy:fiji",
  ]);
  const finalPlan = summarizePlan(finals, teams);
  const finalRowIds = new Set(finalPlan.flatMap(({ id }) => (id ? [id] : [])));
  const finalUpdates = finalPlan.filter(
    ({ operation }) => operation === "update",
  );
  const validFinals =
    finalPlan.length === finalPairs.size &&
    finalPlan.every(({ home, away }) => finalPairs.delete(`${home}:${away}`)) &&
    finalRowIds.size === finalUpdates.length &&
    finals.every(
      ({ candidate, existing, operation }) =>
        candidate.status === "scheduled" &&
        (operation === "insert" ||
          (operation === "update" && existing?.status === "scheduled")),
    );
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        databaseWrites: 0,
        blockedWriteAttempts: writeAttempts,
        repairs,
        proposedSql: repairs.map(repairSql),
        duplicateDependencies: dependencies,
        beforeRepair: summarizePlan(beforePlan, teams),
        afterRepair: summarizePlan(afterPlan, teams),
        finals: finalPlan,
        historicalKickoffChanges: summarizePlan(kickoffChanges, teams),
        historicalOtherChanges: summarizePlan(otherChanges, teams),
      },
      null,
      2,
    ),
  );
  if (!validFinals || kickoffChanges.length > 0 || otherChanges.length > 0) {
    throw new Error(
      "Repair preflight did not meet the six-finals / zero-unsafe-historical-changes acceptance criteria; inspect output without applying SQL",
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Repair dry-run failed",
    );
    process.exitCode = 1;
  });
}
