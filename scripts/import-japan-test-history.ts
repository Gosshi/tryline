import { getSupabaseServerClient } from "@/lib/db/server";
import { parseJapanTestHistory } from "@/lib/ingestion/sources/wikipedia-japan-test-history";
import { fetchWikipediaWikitext } from "@/lib/ingestion/sources/wikipedia-wikitext";

import type { ParsedJapanTestHistory } from "@/lib/ingestion/sources/wikipedia-japan-test-history";

const PAGE_TITLE = "List of Japan national rugby union test matches";
const SOURCE_URL =
  "https://en.wikipedia.org/wiki/List_of_Japan_national_rugby_union_test_matches";
const ALIASES: Record<string, string> = {
  "Hong Kong": "hong-kong-china",
  Chile: "chile",
};

type TeamLookupRow = { id: string; name: string; slug: string; kind: string };
type HistoryInsert = {
  team_id: string;
  opponent_team_id: string;
  played_on: string;
  team_score: number;
  opponent_score: number;
  venue: string | null;
  competition_label: string | null;
  source_url: string;
};

export type JapanHistoryImportResult = {
  applied: boolean;
  imported: number;
  unknownOpponentCounts: Record<string, number>;
  opponentCounts: Record<string, number>;
};

export async function importJapanTestHistory(options: {
  apply: boolean;
  wikitext: string;
  teams: TeamLookupRow[];
  upsert: (rows: HistoryInsert[], onConflict: string) => Promise<void>;
  today?: string;
}): Promise<JapanHistoryImportResult> {
  const japan = options.teams.find(
    (team) => team.slug === "japan" && team.kind === "national",
  );
  if (!japan) throw new Error("Japan national team is missing from teams.");

  const byName = new Map(
    options.teams
      .filter((team) => team.kind === "national")
      .map((team) => [team.name, team]),
  );
  const bySlug = new Map(options.teams.map((team) => [team.slug, team]));
  const opponentCounts: Record<string, number> = {};
  const unknownOpponentCounts: Record<string, number> = {};
  const records: HistoryInsert[] = [];
  for (const row of parseJapanTestHistory(options.wikitext, options.today)) {
    const slug = ALIASES[row.opponentName];
    const opponent = slug ? bySlug.get(slug) : byName.get(row.opponentName);
    if (!opponent || opponent.kind !== "national") {
      unknownOpponentCounts[row.opponentName] =
        (unknownOpponentCounts[row.opponentName] ?? 0) + 1;
      continue;
    }
    if (opponent.id === japan.id) continue;
    opponentCounts[row.opponentName] =
      (opponentCounts[row.opponentName] ?? 0) + 1;
    records.push({
      team_id: japan.id,
      opponent_team_id: opponent.id,
      played_on: row.playedOn,
      team_score: row.teamScore,
      opponent_score: row.opponentScore,
      venue: row.venue,
      competition_label: row.competitionLabel,
      source_url: SOURCE_URL,
    });
  }
  if (options.apply && records.length)
    await options.upsert(records, "team_id,opponent_team_id,played_on");
  return {
    applied: options.apply,
    imported: records.length,
    unknownOpponentCounts,
    opponentCounts,
  };
}

async function main(args = process.argv.slice(2)) {
  const apply = args.includes("--apply");
  const unknownArgs = args.filter((arg) => arg !== "--apply");
  if (unknownArgs.length)
    throw new Error(`Unknown arguments: ${unknownArgs.join(" ")}`);
  const wikitext = await fetchWikipediaWikitext([PAGE_TITLE]);
  const client = getSupabaseServerClient();
  const { data: teams, error: teamError } = await client
    .from("teams")
    .select("id, name, slug, kind");
  if (teamError) throw teamError;
  const result = await importJapanTestHistory({
    apply,
    wikitext,
    teams: (teams ?? []) as TeamLookupRow[],
    upsert: async (rows, onConflict) => {
      const { error } = await client
        .from("national_test_history")
        .upsert(rows, { onConflict });
      if (error) throw error;
    },
  });
  console.log(
    `${result.applied ? "APPLY" : "DRY-RUN"}: ${result.imported} rows`,
  );
  console.log("Opponent counts:", result.opponentCounts);
  console.log(
    "Unknown opponents (not imported):",
    result.unknownOpponentCounts,
  );
}

export async function runCli(
  run: () => Promise<void> = main,
  exit: (code: number) => never = process.exit,
) {
  try {
    await run();
  } catch (error) {
    console.error(error);
    exit(1);
  }
}

if (process.argv[1]?.endsWith("import-japan-test-history.ts")) void runCli();

// Keep the parsed source shape visible to type consumers of this import module.
export type { ParsedJapanTestHistory };
