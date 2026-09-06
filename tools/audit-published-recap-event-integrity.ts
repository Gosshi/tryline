/**
 * Audit event integrity for matches with a published recap.
 *
 * Read-only usage:
 *   node --env-file=.env.production.local tools/run-ts.cjs tools/audit-published-recap-event-integrity.ts
 *
 * This audit only reports the current data snapshot. It never changes events,
 * content, or match records, and it does not call an LLM.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseServerClient } from "@/lib/db/server";
import {
  computeEventPointTotals,
  eventTotalsMatchFinalScore,
  toScoreTimelineEvent,
} from "@/lib/ingestion/event-integrity";
import {
  extractFixtureIdentifiers,
  extractUnreliableIdentifiers,
} from "@/lib/ingestion/external-identifiers";

import type { Database, Json } from "@/lib/db/types";
import type {
  EventIntegrityEvent,
  EventIntegrityTeams,
} from "@/lib/ingestion/event-integrity";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT_DIR = "tmp/event-integrity-audit";
const PAGE_SIZE = 500;
const SITE_URL = "https://www.trylinerugby.com";
const UNRELIABLE_KEY_COLLISION_LIMIT = 25;
const UNRELIABLE_KEY_COLLISION_SAMPLE_LIMIT = 3;

type Logger = Pick<Console, "log">;

type AuditContentRow = {
  content_type: string;
  generated_at: string;
  language: string;
  match_id: string;
  prompt_version: string;
  status: string;
};

type AuditEventRow = {
  match_id: string;
  metadata: Json;
  minute: number | null;
  team_id: string;
  type: string;
};

type TeamReference = {
  id: string;
  name: string;
  name_ja: string | null;
};

type CompetitionReference = {
  slug: string;
};

type AuditMatchRow = {
  away_score: number | null;
  away_team: CompetitionTeamReference;
  away_team_id: string;
  competition: CompetitionReference | CompetitionReference[] | null;
  external_ids: Json;
  home_score: number | null;
  home_team: CompetitionTeamReference;
  home_team_id: string;
  id: string;
  kickoff_at: string;
  status: string;
};

type CompetitionTeamReference = TeamReference | TeamReference[] | null;

type NormalizedAuditEvent = {
  integrityEvent: EventIntegrityEvent;
  signature: string;
  teamId: string;
};

type RecapArticle = {
  generatedAt: string;
  language: string;
  promptVersion: string;
};

type Check = "C1" | "C2" | "C3" | "C4" | "C5";
type Severity = "confirmed" | "incomplete" | "suspect";

export type EventIntegrityAuditFinding = {
  awayScore: number | null;
  awayTeam: string;
  checksHit: Check[];
  competitionSlug: string;
  eventAwayTotal: number | null;
  eventCount: number;
  eventHomeTotal: number | null;
  homeScore: number | null;
  homeTeam: string;
  kickoffUtc: string;
  matchId: string;
  pairedMatchIds: string[];
  recapArticles: RecapArticle[];
  recapPromptVersion: string | null;
  recapUpdatedAt: string | null;
  severity: Severity;
  url: string;
};

export type EventIntegrityAuditReport = {
  currentDataNote: string;
  findings: EventIntegrityAuditFinding[];
  generatedAt: string;
  groups: {
    contentlessFinished: number;
    draftRecap: number;
    previewOnly: number;
  };
  identifierQuality: {
    matchesWithFixtureIdentifier: number;
    matchesWithoutFixtureIdentifier: number;
    unreliableKeyCollisions: Array<{
      key: string;
      matchCount: number;
      sampleMatchIds: string[];
      value: string;
    }>;
    unreliableKeyCollisionLimit: number;
    unreliableKeyCollisionTotal: number;
    unreliableKeyCollisionRemaining: number;
  };
  retrievedAt: string;
  summary: {
    C1: number;
    C2: number;
    C3: number;
    C4: number;
    C5: number;
    incomplete: number;
    targetDistinctMatchCount: number;
  };
};

export type EventIntegrityAuditOptions = {
  outputDir: string;
};

function normalizeJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function displayTeamName(team: CompetitionTeamReference): string {
  const normalized = normalizeJoin(team);

  return normalized?.name_ja ?? normalized?.name ?? "";
}

function getJsonRecord(value: Json): Record<string, Json> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function getMetadataString(metadata: Json, key: string): string {
  const value = getJsonRecord(metadata)?.[key];

  return typeof value === "string" ? value : "";
}

function getMetadataBoolean(metadata: Json, key: string): boolean {
  return getJsonRecord(metadata)?.[key] === true;
}

function normalizePlayerName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function toNormalizedEvent(
  event: AuditEventRow,
  teams: EventIntegrityTeams,
): NormalizedAuditEvent {
  const integrityEvent: EventIntegrityEvent = {
    isPenaltyTry: getMetadataBoolean(event.metadata, "is_penalty_try"),
    minute: event.minute,
    playerName: getMetadataString(event.metadata, "player_name"),
    teamId: event.team_id,
    type: event.type,
  };
  const scoreEvent = toScoreTimelineEvent(integrityEvent, teams);

  return {
    integrityEvent,
    signature: [
      scoreEvent.minute ?? "",
      scoreEvent.type.trim().toLocaleLowerCase(),
      normalizePlayerName(scoreEvent.player_name),
    ].join("\u0000"),
    teamId: event.team_id,
  };
}

function signatureKey(events: NormalizedAuditEvent[]): string | null {
  if (events.length < 4) {
    return null;
  }

  return events
    .map((event) => event.signature)
    .sort((left, right) => left.localeCompare(right))
    .join("\u0001");
}

function signatureHash(signature: string): string {
  const hasher = createHash("sha256");
  hasher["update"](signature);

  return hasher.digest("hex");
}

function sameParticipants(left: AuditMatchRow, right: AuditMatchRow): boolean {
  return (
    (new Set([left.home_team_id, left.away_team_id]).size === 2 &&
      left.home_team_id !== right.home_team_id &&
      left.home_team_id === right.away_team_id &&
      left.away_team_id === right.home_team_id) ||
    (left.home_team_id === right.home_team_id &&
      left.away_team_id === right.away_team_id)
  );
}

function eventKey(signature: string, teamId: string): string {
  return `${signature}\u0000${teamId}`;
}

function countByEventKey(events: NormalizedAuditEvent[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    const key = eventKey(event.signature, event.teamId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function allTeamAssignmentsAreReversed(
  left: NormalizedAuditEvent[],
  right: NormalizedAuditEvent[],
  match: AuditMatchRow,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightCounts = countByEventKey(right);

  for (const event of left) {
    const reversedTeamId =
      event.teamId === match.home_team_id
        ? match.away_team_id
        : event.teamId === match.away_team_id
          ? match.home_team_id
          : null;

    if (!reversedTeamId) {
      return false;
    }

    const key = eventKey(event.signature, reversedTeamId);
    const count = rightCounts.get(key) ?? 0;

    if (count === 0) {
      return false;
    }

    rightCounts.set(key, count - 1);
  }

  return [...rightCounts.values()].every((count) => count === 0);
}

function csvEscape(value: string | number | null): string {
  const raw = value === null ? "" : String(value);

  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function findingsToCsv(findings: EventIntegrityAuditFinding[]): string {
  const header = [
    "match_id",
    "url",
    "competition_slug",
    "kickoff_utc",
    "home_team",
    "away_team",
    "home_score",
    "away_score",
    "event_home_total",
    "event_away_total",
    "event_count",
    "checks_hit",
    "paired_match_id",
    "severity",
    "recap_prompt_version",
    "recap_updated_at",
    "recap_articles",
  ];
  const rows = findings.map((finding) =>
    [
      finding.matchId,
      finding.url,
      finding.competitionSlug,
      finding.kickoffUtc,
      finding.homeTeam,
      finding.awayTeam,
      finding.homeScore,
      finding.awayScore,
      finding.eventHomeTotal,
      finding.eventAwayTotal,
      finding.eventCount,
      finding.checksHit.join(","),
      JSON.stringify(finding.pairedMatchIds),
      finding.severity,
      finding.recapPromptVersion,
      finding.recapUpdatedAt,
      JSON.stringify(finding.recapArticles),
    ]
      .map(csvEscape)
      .join(","),
  );

  return `${[header.join(","), ...rows].join("\n")}\n`;
}

function reportToSummaryJson(report: EventIntegrityAuditReport) {
  return {
    checks: report.summary,
    current_data_note: report.currentDataNote,
    generated_at: report.generatedAt,
    groups: {
      contentless_finished: report.groups.contentlessFinished,
      draft_recap: report.groups.draftRecap,
      preview_only: report.groups.previewOnly,
    },
    identifier_quality: {
      matches_with_fixture_identifier:
        report.identifierQuality.matchesWithFixtureIdentifier,
      matches_without_fixture_identifier:
        report.identifierQuality.matchesWithoutFixtureIdentifier,
      unreliable_key_collisions:
        report.identifierQuality.unreliableKeyCollisions.map(
          ({ key, matchCount, sampleMatchIds, value }) => ({
            key,
            match_count: matchCount,
            sample_match_ids: sampleMatchIds,
            value,
          }),
        ),
      unreliable_key_collision_query_note:
        "全件を確認する場合: select id from matches where external_ids->>'<key>' = '<value>';",
      unreliable_key_collision_limit:
        report.identifierQuality.unreliableKeyCollisionLimit,
      unreliable_key_collision_total:
        report.identifierQuality.unreliableKeyCollisionTotal,
      unreliable_key_collision_remaining:
        report.identifierQuality.unreliableKeyCollisionRemaining,
    },
    retrieved_at: report.retrievedAt,
  };
}

async function loadAllContentRows(db: SupabaseClient<Database>) {
  const rows: AuditContentRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("match_content")
      .select(
        "match_id, content_type, status, language, prompt_version, generated_at",
      )
      .in("content_type", ["preview", "recap"])
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as unknown as AuditContentRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

async function loadAllEventRows(db: SupabaseClient<Database>) {
  const rows: AuditEventRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("match_events")
      .select("match_id, team_id, minute, type, metadata")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as unknown as AuditEventRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

async function loadAllMatchRows(db: SupabaseClient<Database>) {
  const rows: AuditMatchRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("matches")
      .select(
        "id, home_team_id, away_team_id, home_score, away_score, status, kickoff_at, external_ids, home_team:teams!matches_home_team_id_fkey(id, name, name_ja), away_team:teams!matches_away_team_id_fkey(id, name, name_ja), competition:competitions!matches_competition_id_fkey(slug)",
      )
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as unknown as AuditMatchRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

function articlesByMatch(rows: AuditContentRow[]) {
  const articles = new Map<string, RecapArticle[]>();

  for (const row of rows) {
    if (row.content_type !== "recap" || row.status !== "published") {
      continue;
    }

    const values = articles.get(row.match_id) ?? [];
    values.push({
      generatedAt: row.generated_at,
      language: row.language,
      promptVersion: row.prompt_version,
    });
    articles.set(row.match_id, values);
  }

  for (const values of articles.values()) {
    values.sort((left, right) =>
      right.generatedAt.localeCompare(left.generatedAt),
    );
  }

  return articles;
}

function groupCounts(
  contentRows: AuditContentRow[],
  matchRows: AuditMatchRow[],
) {
  const publishedRecaps = new Set(
    contentRows
      .filter(
        (row) => row.content_type === "recap" && row.status === "published",
      )
      .map((row) => row.match_id),
  );
  const previewOnly = new Set(
    contentRows
      .filter(
        (row) =>
          row.content_type === "preview" && !publishedRecaps.has(row.match_id),
      )
      .map((row) => row.match_id),
  );
  const draftRecap = new Set(
    contentRows
      .filter(
        (row) =>
          row.content_type === "recap" &&
          row.status === "draft" &&
          !publishedRecaps.has(row.match_id),
      )
      .map((row) => row.match_id),
  );
  const contentMatchIds = new Set(contentRows.map((row) => row.match_id));

  return {
    contentlessFinished: matchRows.filter(
      (row) => row.status === "finished" && !contentMatchIds.has(row.id),
    ).length,
    draftRecap: draftRecap.size,
    previewOnly: previewOnly.size,
  };
}

export async function auditPublishedRecapEventIntegrity(
  db: SupabaseClient<Database>,
  options: EventIntegrityAuditOptions = { outputDir: DEFAULT_OUTPUT_DIR },
  generatedAt = new Date().toISOString(),
  logger: Logger = console,
): Promise<EventIntegrityAuditReport> {
  const contentRows = await loadAllContentRows(db);
  const recapArticles = articlesByMatch(contentRows);
  const targetMatchIds = new Set(recapArticles.keys());

  logger.log(
    `Published recap event-integrity audit targets: ${targetMatchIds.size}`,
  );

  const [eventRows, matchRows] = await Promise.all([
    loadAllEventRows(db),
    loadAllMatchRows(db),
  ]);
  const matchById = new Map(matchRows.map((row) => [row.id, row]));
  const eventsByMatch = new Map<string, AuditEventRow[]>();

  for (const event of eventRows) {
    const values = eventsByMatch.get(event.match_id) ?? [];
    values.push(event);
    eventsByMatch.set(event.match_id, values);
  }

  const normalizedEventsByMatch = new Map<string, NormalizedAuditEvent[]>();

  for (const [matchId, events] of eventsByMatch) {
    const match = matchById.get(matchId);

    if (!match) {
      continue;
    }

    const teams: EventIntegrityTeams = {
      away: { id: match.away_team_id, name: displayTeamName(match.away_team) },
      home: { id: match.home_team_id, name: displayTeamName(match.home_team) },
    };
    normalizedEventsByMatch.set(
      matchId,
      events.map((event) => toNormalizedEvent(event, teams)),
    );
  }

  const pairedMatchIds = new Map<string, Set<string>>();
  const checksByMatch = new Map<string, Set<Check>>();
  const addCheck = (matchId: string, check: Check) => {
    const checks = checksByMatch.get(matchId) ?? new Set<Check>();
    checks.add(check);
    checksByMatch.set(matchId, checks);
  };
  const addPair = (matchId: string, pairedMatchId: string) => {
    const pairs = pairedMatchIds.get(matchId) ?? new Set<string>();
    pairs.add(pairedMatchId);
    pairedMatchIds.set(matchId, pairs);
  };

  const bySignatureHash = new Map<string, Map<string, string[]>>();

  for (const [matchId, events] of normalizedEventsByMatch) {
    const key = signatureKey(events);

    if (!key) {
      continue;
    }

    const hash = signatureHash(key);
    const groups = bySignatureHash.get(hash) ?? new Map<string, string[]>();
    const matchIds = groups.get(key) ?? [];
    matchIds.push(matchId);
    groups.set(key, matchIds);
    bySignatureHash.set(hash, groups);
  }

  for (const groups of bySignatureHash.values()) {
    for (const matchIds of groups.values()) {
      if (matchIds.length < 2) {
        continue;
      }

      for (let index = 0; index < matchIds.length; index += 1) {
        for (
          let pairedIndex = index + 1;
          pairedIndex < matchIds.length;
          pairedIndex += 1
        ) {
          const leftId = matchIds[index] as string;
          const rightId = matchIds[pairedIndex] as string;
          const left = matchById.get(leftId);
          const right = matchById.get(rightId);

          if (!left || !right) {
            continue;
          }

          if (targetMatchIds.has(leftId)) {
            addCheck(leftId, "C3");
            addPair(leftId, rightId);
          }

          if (targetMatchIds.has(rightId)) {
            addCheck(rightId, "C3");
            addPair(rightId, leftId);
          }

          if (
            sameParticipants(left, right) &&
            allTeamAssignmentsAreReversed(
              normalizedEventsByMatch.get(leftId) ?? [],
              normalizedEventsByMatch.get(rightId) ?? [],
              left,
            )
          ) {
            if (targetMatchIds.has(leftId)) {
              addCheck(leftId, "C4");
            }

            if (targetMatchIds.has(rightId)) {
              addCheck(rightId, "C4");
            }
          }
        }
      }
    }
  }

  const matchesByExternalIdentifier = new Map<string, string[]>();
  const matchesByUnreliableIdentifier = new Map<string, string[]>();
  let matchesWithFixtureIdentifier = 0;

  // Quality coverage includes every match, regardless of recap or event presence.
  for (const match of matchRows) {
    const identifiers = extractFixtureIdentifiers(match.external_ids);
    if (identifiers.length > 0) {
      matchesWithFixtureIdentifier += 1;
    }

    for (const identifier of identifiers) {
      const matchIds = matchesByExternalIdentifier.get(identifier) ?? [];
      matchIds.push(match.id);
      matchesByExternalIdentifier.set(identifier, matchIds);
    }

    for (const identifier of extractUnreliableIdentifiers(match.external_ids)) {
      const matchIds = matchesByUnreliableIdentifier.get(identifier) ?? [];
      matchIds.push(match.id);
      matchesByUnreliableIdentifier.set(identifier, matchIds);
    }
  }

  const unreliableKeyCollisions = [...matchesByUnreliableIdentifier]
    .filter(([, matchIds]) => matchIds.length > 1)
    .map(([identifier, matchIds]) => {
      const separator = identifier.indexOf("=");
      const sortedMatchIds = [...matchIds].sort();

      return {
        key: identifier.slice(0, separator),
        matchCount: sortedMatchIds.length,
        sampleMatchIds: sortedMatchIds.slice(
          0,
          UNRELIABLE_KEY_COLLISION_SAMPLE_LIMIT,
        ),
        value: identifier.slice(separator + 1),
      };
    })
    // Show the largest collisions first, with stable ordering for equal counts.
    .sort(
      (left, right) =>
        right.matchCount - left.matchCount ||
        left.key.localeCompare(right.key) ||
        left.value.localeCompare(right.value),
    );

  for (const matchIds of matchesByExternalIdentifier.values()) {
    if (matchIds.length < 2) {
      continue;
    }

    for (const matchId of matchIds) {
      if (!targetMatchIds.has(matchId)) {
        continue;
      }

      addCheck(matchId, "C5");
      for (const pairedMatchId of matchIds) {
        if (pairedMatchId !== matchId) {
          addPair(matchId, pairedMatchId);
        }
      }
    }
  }

  const findings: EventIntegrityAuditFinding[] = [];

  for (const matchId of targetMatchIds) {
    const match = matchById.get(matchId);

    if (!match) {
      continue;
    }

    const events = normalizedEventsByMatch.get(matchId) ?? [];
    const checks = checksByMatch.get(matchId) ?? new Set<Check>();
    const teams: EventIntegrityTeams = {
      away: { id: match.away_team_id, name: displayTeamName(match.away_team) },
      home: { id: match.home_team_id, name: displayTeamName(match.home_team) },
    };
    const eventHasThirdTeam = events.some(
      (event) =>
        event.teamId !== teams.home.id && event.teamId !== teams.away.id,
    );

    if (eventHasThirdTeam) {
      checks.add("C2");
    }

    const cannotScoreCheck =
      events.length === 0 ||
      match.home_score === null ||
      match.away_score === null;
    const totals = cannotScoreCheck
      ? null
      : computeEventPointTotals(
          events.map((event) => event.integrityEvent),
          teams,
        );

    if (
      totals &&
      !eventTotalsMatchFinalScore(totals, {
        away_score: match.away_score,
        home_score: match.home_score,
      })
    ) {
      checks.add("C1");
    }

    const orderedChecks = (["C1", "C2", "C3", "C4", "C5"] as Check[]).filter(
      (check) => checks.has(check),
    );
    const severity: Severity = cannotScoreCheck
      ? "incomplete"
      : checks.has("C4") && (checks.has("C1") || checks.has("C2"))
        ? "confirmed"
        : orderedChecks.length > 0
          ? "suspect"
          : "suspect";

    if (orderedChecks.length === 0 && severity !== "incomplete") {
      continue;
    }

    const articles = recapArticles.get(matchId) ?? [];
    const currentRecap = articles[0] ?? null;
    findings.push({
      awayScore: match.away_score,
      awayTeam: displayTeamName(match.away_team),
      checksHit: orderedChecks,
      competitionSlug: normalizeJoin(match.competition)?.slug ?? "",
      eventAwayTotal: totals?.away ?? null,
      eventCount: events.length,
      eventHomeTotal: totals?.home ?? null,
      homeScore: match.home_score,
      homeTeam: displayTeamName(match.home_team),
      kickoffUtc: match.kickoff_at,
      matchId,
      pairedMatchIds: [...(pairedMatchIds.get(matchId) ?? [])].sort(),
      recapArticles: articles,
      recapPromptVersion: currentRecap?.promptVersion ?? null,
      recapUpdatedAt: currentRecap?.generatedAt ?? null,
      severity,
      url: `${SITE_URL}/matches/${matchId}`,
    });
  }

  findings.sort((left, right) => left.matchId.localeCompare(right.matchId));
  const count = (check: Check) =>
    findings.filter((finding) => finding.checksHit.includes(check)).length;

  return {
    currentDataNote:
      "この監査は現在のデータのスナップショットに基づくものであり、記事生成時点のデータを再現するものではありません。",
    findings,
    generatedAt,
    groups: groupCounts(contentRows, matchRows),
    identifierQuality: {
      matchesWithFixtureIdentifier,
      matchesWithoutFixtureIdentifier:
        matchRows.length - matchesWithFixtureIdentifier,
      unreliableKeyCollisions: unreliableKeyCollisions.slice(
        0,
        UNRELIABLE_KEY_COLLISION_LIMIT,
      ),
      unreliableKeyCollisionLimit: UNRELIABLE_KEY_COLLISION_LIMIT,
      unreliableKeyCollisionTotal: unreliableKeyCollisions.length,
      unreliableKeyCollisionRemaining: Math.max(
        0,
        unreliableKeyCollisions.length - UNRELIABLE_KEY_COLLISION_LIMIT,
      ),
    },
    retrievedAt: generatedAt,
    summary: {
      C1: count("C1"),
      C2: count("C2"),
      C3: count("C3"),
      C4: count("C4"),
      C5: count("C5"),
      incomplete: findings.filter(
        (finding) => finding.severity === "incomplete",
      ).length,
      targetDistinctMatchCount: targetMatchIds.size,
    },
  };
}

export async function writeEventIntegrityAuditReport(
  report: EventIntegrityAuditReport,
  outputDir = DEFAULT_OUTPUT_DIR,
): Promise<{ csvPath: string; summaryPath: string }> {
  const reportDir = path.join(outputDir, report.generatedAt);
  const summaryPath = path.join(reportDir, "summary.json");
  const csvPath = path.join(reportDir, "findings.csv");

  await mkdir(reportDir, { recursive: true });
  await Promise.all([
    writeFile(
      summaryPath,
      `${JSON.stringify(reportToSummaryJson(report), null, 2)}\n`,
      "utf8",
    ),
    writeFile(csvPath, findingsToCsv(report.findings), "utf8"),
  ]);

  return { csvPath, summaryPath };
}

export function parseArgs(argv: string[]): EventIntegrityAuditOptions {
  const outputDirArgument = argv.find((argument) =>
    argument.startsWith("--output-dir="),
  );

  return {
    outputDir:
      outputDirArgument?.slice("--output-dir=".length) || DEFAULT_OUTPUT_DIR,
  };
}

async function writeIncompleteReport(
  outputDir: string,
  generatedAt: string,
  error: unknown,
) {
  const reportDir = path.join(outputDir, generatedAt);
  const summaryPath = path.join(reportDir, "summary.json");
  const message = error instanceof Error ? error.message : String(error);

  await mkdir(reportDir, { recursive: true });
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        current_data_note:
          "この監査は現在のデータのスナップショットに基づくものであり、記事生成時点のデータを再現するものではありません。",
        error: message,
        generated_at: generatedAt,
        status: "incomplete",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return summaryPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();

  try {
    const report = await auditPublishedRecapEventIntegrity(
      getSupabaseServerClient(),
      options,
      generatedAt,
    );
    const paths = await writeEventIntegrityAuditReport(
      report,
      options.outputDir,
    );

    console.log(
      `Event integrity audit complete: targets=${report.summary.targetDistinctMatchCount} C1=${report.summary.C1} C2=${report.summary.C2} C3=${report.summary.C3} C4=${report.summary.C4} C5=${report.summary.C5} incomplete=${report.summary.incomplete}`,
    );
    console.log(`Summary: ${paths.summaryPath}`);
    console.log(`Findings: ${paths.csvPath}`);
  } catch (error) {
    const summaryPath = await writeIncompleteReport(
      options.outputDir,
      generatedAt,
      error,
    );
    console.error(`Event integrity audit incomplete: ${summaryPath}`);
    throw error;
  }
}

if (process.argv[1]?.endsWith("audit-published-recap-event-integrity.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
