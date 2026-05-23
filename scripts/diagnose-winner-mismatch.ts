import { getSupabaseServerClient } from "@/lib/db/server";
import { generateMatchContent } from "@/lib/llm/pipeline";

import type { Database } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  fix: boolean;
};

type ContentRow = {
  content_md: string;
  match_id: string;
};

type MatchRow = {
  away_score: number | null;
  away_team: { name: string } | null;
  home_score: number | null;
  home_team: { name: string } | null;
  id: string;
};

export type WinnerMismatchSuspicion = {
  loserName: string;
  matchId: string;
  matchedText: string;
  winnerName: string;
};

export type DiagnoseWinnerMismatchResult = {
  checked: number;
  failed: number;
  fixed: number;
  suspicions: WinnerMismatchSuspicion[];
};

type Logger = Pick<Console, "error" | "log" | "warn">;

type RunDeps = {
  db: SupabaseClient<Database>;
  fix: boolean;
  generateContent?: (
    matchId: string,
    contentType: "recap",
  ) => Promise<PipelineResult>;
  logger?: Logger;
};

const SUSPECT_STATUSES = ["draft", "published"] as const;
const LOSER_WINNER_PATTERNS = [
  "が勝利",
  "が制した",
  "が逃げ切った",
  "が下した",
  "の勝利",
  "が接戦をものにした",
];

export function parseArgs(argv: string[]): CliOptions {
  return {
    fix: argv.includes("--fix"),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findWinnerMismatchSuspicion(params: {
  content: string;
  match: MatchRow;
}): WinnerMismatchSuspicion | null {
  const homeScore = params.match.home_score;
  const awayScore = params.match.away_score;
  const homeName = params.match.home_team?.name;
  const awayName = params.match.away_team?.name;

  if (
    typeof homeScore !== "number" ||
    typeof awayScore !== "number" ||
    homeScore === awayScore ||
    !homeName ||
    !awayName
  ) {
    return null;
  }

  const winnerName = homeScore > awayScore ? homeName : awayName;
  const loserName = homeScore > awayScore ? awayName : homeName;
  const escapedLoser = escapeRegExp(loserName);

  for (const phrase of LOSER_WINNER_PATTERNS) {
    const regex = new RegExp(`${escapedLoser}.{0,40}${escapeRegExp(phrase)}`);
    const match = params.content.match(regex);

    if (match) {
      return {
        loserName,
        matchId: params.match.id,
        matchedText: match[0],
        winnerName,
      };
    }
  }

  return null;
}

async function getRecapRows(db: SupabaseClient<Database>) {
  const { data, error } = await db
    .from("match_content")
    .select("match_id, content_md")
    .eq("content_type", "recap")
    .in("status", [...SUSPECT_STATUSES]);

  if (error) {
    throw error;
  }

  return (data ?? []) as ContentRow[];
}

async function getMatchRow(db: SupabaseClient<Database>, matchId: string) {
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        home_score,
        away_score,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `,
    )
    .eq("id", matchId)
    .single();

  if (error) {
    throw error;
  }

  return data as unknown as MatchRow;
}

async function deleteRecap(db: SupabaseClient<Database>, matchId: string) {
  const { error } = await db
    .from("match_content")
    .delete()
    .eq("match_id", matchId)
    .eq("content_type", "recap");

  if (error) {
    throw error;
  }
}

export async function runDiagnoseWinnerMismatch({
  db,
  fix,
  generateContent = (matchId, contentType) =>
    generateMatchContent(matchId, contentType),
  logger = console,
}: RunDeps): Promise<DiagnoseWinnerMismatchResult> {
  const contentRows = await getRecapRows(db);
  const suspicions: WinnerMismatchSuspicion[] = [];
  let failed = 0;
  let fixed = 0;

  for (const row of contentRows) {
    try {
      const match = await getMatchRow(db, row.match_id);
      const suspicion = findWinnerMismatchSuspicion({
        content: row.content_md,
        match,
      });

      if (!suspicion) {
        continue;
      }

      suspicions.push(suspicion);
      logger.warn(
        `[suspect] ${suspicion.matchId}: loser=${suspicion.loserName} winner=${suspicion.winnerName} text=${suspicion.matchedText}`,
      );

      if (!fix) {
        continue;
      }

      await deleteRecap(db, row.match_id);
      await generateContent(row.match_id, "recap");
      fixed += 1;
      logger.log(`[fixed] regenerated recap for ${row.match_id}`);
    } catch (error) {
      failed += 1;
      logger.error(
        `[diagnose-winner-mismatch] failed for ${row.match_id}`,
        error,
      );
    }
  }

  logger.log(
    `Winner mismatch diagnosis complete: checked=${contentRows.length} suspects=${suspicions.length} fixed=${fixed} failed=${failed}`,
  );

  if (!fix) {
    logger.log("[diagnose-only] No content was deleted or regenerated.");
  }

  return {
    checked: contentRows.length,
    failed,
    fixed,
    suspicions,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runDiagnoseWinnerMismatch({
    db: getSupabaseServerClient(),
    fix: options.fix,
  });
}

if (process.argv[1]?.endsWith("diagnose-winner-mismatch.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
