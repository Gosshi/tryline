/**
 * Report Japanese date mentions in preview/recap content for early-JST kickoffs.
 *
 * Read-only usage:
 *   node --env-file=.env.production.local tools/run-ts.cjs tools/audit-narrative-kickoff-dates.ts
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { formatKickoffJst, formatKickoffJstTime } from "@/lib/format/kickoff";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContentType = "preview" | "recap";

type MatchReference = {
  id: string;
  kickoff_at: string;
};

type MatchContentRow = {
  content_md: string;
  content_type: ContentType;
  id: string;
  match: MatchReference | MatchReference[] | null;
  match_id: string;
  status: string;
};

type MatchContentReference = Omit<MatchContentRow, "content_md">;

export type DateMentionMatch = "jst" | "utc" | "neither";

export type NarrativeKickoffDateFinding = {
  contentId: string;
  contentType: ContentType;
  dateLabel: string;
  dateMatch: DateMentionMatch;
  kickoffAt: string;
  kickoffAtJst: string;
  matchId: string;
  status: string;
};

export type NarrativeKickoffDateAuditResult = {
  earlyJstContentCount: number;
  findings: NarrativeKickoffDateFinding[];
  jstDateMatches: number;
  utcDateMatches: number;
};

type Logger = Pick<Console, "log">;

const PAGE_SIZE = 500;
const CONTENT_BATCH_SIZE = 100;

function datePartsFromUtc(kickoffAt: string) {
  const date = new Date(kickoffAt);

  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1 };
}

function datePartsFromJst(kickoffAt: string) {
  const formatted = formatKickoffJst(kickoffAt);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(formatted);

  if (!match) {
    throw new Error(`Unable to parse formatted JST kickoff: ${formatted}`);
  }

  return { day: Number(match[3]), month: Number(match[2]) };
}

function isEarlyJstKickoff(kickoffAt: string) {
  const hour = Number(formatKickoffJstTime(kickoffAt).slice(0, 2));

  return hour >= 0 && hour <= 8;
}

function normalizeMatchReference(
  match: MatchContentRow["match"],
): MatchReference | null {
  return Array.isArray(match) ? (match[0] ?? null) : match;
}

export function findNarrativeKickoffDateMentions(
  row: MatchContentRow,
): NarrativeKickoffDateFinding[] {
  const match = normalizeMatchReference(row.match);

  if (!match || !isEarlyJstKickoff(match.kickoff_at)) {
    return [];
  }

  const jstDate = datePartsFromJst(match.kickoff_at);
  const utcDate = datePartsFromUtc(match.kickoff_at);
  const dateMentionPattern = /(\d{1,2})月(\d{1,2})日/g;
  const findings: NarrativeKickoffDateFinding[] = [];

  for (const dateMention of row.content_md.matchAll(dateMentionPattern)) {
    const month = Number(dateMention[1]);
    const day = Number(dateMention[2]);
    const dateMatch: DateMentionMatch =
      month === jstDate.month && day === jstDate.day
        ? "jst"
        : month === utcDate.month && day === utcDate.day
          ? "utc"
          : "neither";

    findings.push({
      contentId: row.id,
      contentType: row.content_type,
      dateLabel: dateMention[0],
      dateMatch,
      kickoffAt: match.kickoff_at,
      kickoffAtJst: formatKickoffJst(match.kickoff_at),
      matchId: row.match_id,
      status: row.status,
    });
  }

  return findings;
}

async function loadMatchContentReferences(db: SupabaseClient<Database>) {
  const rows: MatchContentReference[] = [];
  let expectedCount: number | null = null;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { count, data, error } = await db
      .from("match_content")
      .select(
        "id, match_id, content_type, status, match:matches!match_content_match_id_fkey(id, kickoff_at)",
        { count: "exact" },
      )
      .in("content_type", ["preview", "recap"])
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (count === null) {
      throw new Error("Narrative kickoff-date audit requires an exact row count.");
    }

    if (expectedCount === null) {
      expectedCount = count;
    }

    const page = (data ?? []) as unknown as MatchContentReference[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  if (expectedCount !== null && rows.length !== expectedCount) {
    throw new Error(
      `Narrative kickoff-date audit loaded ${rows.length} of ${expectedCount} content rows.`,
    );
  }

  return rows;
}

async function loadContentBodies(
  db: SupabaseClient<Database>,
  contentIds: string[],
) {
  const contentById = new Map<string, string>();

  for (let offset = 0; offset < contentIds.length; offset += CONTENT_BATCH_SIZE) {
    const ids = contentIds.slice(offset, offset + CONTENT_BATCH_SIZE);
    const { data, error } = await db
      .from("match_content")
      .select("id, content_md")
      .in("id", ids);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      contentById.set(row.id, row.content_md);
    }
  }

  return contentById;
}

export async function runNarrativeKickoffDateAudit(
  db: SupabaseClient<Database>,
  logger: Logger = console,
): Promise<NarrativeKickoffDateAuditResult> {
  const references = await loadMatchContentReferences(db);
  const earlyJstContent = references.filter((row) => {
    const match = normalizeMatchReference(row.match);

    return match !== null && isEarlyJstKickoff(match.kickoff_at);
  });
  const contentById = await loadContentBodies(
    db,
    earlyJstContent.map((row) => row.id),
  );
  if (contentById.size !== earlyJstContent.length) {
    throw new Error(
      `Narrative kickoff-date audit loaded ${contentById.size} of ${earlyJstContent.length} early-JST content bodies.`,
    );
  }
  const rows = earlyJstContent.flatMap((row): MatchContentRow[] => {
    const contentMd = contentById.get(row.id);

    return contentMd === undefined ? [] : [{ ...row, content_md: contentMd }];
  });
  const findings = rows.flatMap(findNarrativeKickoffDateMentions);
  const jstDateMatches = findings.filter(
    (finding) => finding.dateMatch === "jst",
  ).length;
  const utcDateMatches = findings.filter(
    (finding) => finding.dateMatch === "utc",
  ).length;

  logger.log(
    `Narrative kickoff-date audit: earlyJstContent=${earlyJstContent.length} dateMentions=${findings.length} jstDateMatches=${jstDateMatches} utcDateMatches=${utcDateMatches}`,
  );
  for (const finding of findings) {
    logger.log(JSON.stringify(finding));
  }

  return {
    earlyJstContentCount: earlyJstContent.length,
    findings,
    jstDateMatches,
    utcDateMatches,
  };
}

async function main() {
  await runNarrativeKickoffDateAudit(getSupabaseServerClient());
}

if (process.argv[1]?.endsWith("audit-narrative-kickoff-dates.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
