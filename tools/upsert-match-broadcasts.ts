import { readFile } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { getSupabaseServerClient } from "@/lib/db/server";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type BroadcastKind = "tv" | "streaming";

export type MatchBroadcastInput = {
  broadcasts: Array<{
    kind: BroadcastKind;
    service_name: string;
    url: string;
  }>;
  match_id: string;
  source_url: string | null;
};

type Logger = Pick<Console, "error" | "log">;

type MatchSummary = {
  away_team: { name: string } | null;
  home_team: { name: string } | null;
  id: string;
  kickoff_at: string;
};

type UpsertDeps = {
  confirm?: (
    summary: MatchSummary,
    input: MatchBroadcastInput,
  ) => Promise<boolean>;
  db: SupabaseClient<Database>;
  logger?: Logger;
  now?: () => Date;
};

export type UpsertMatchBroadcastsResult = {
  matchId: string;
  upserted: number;
};

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function readOptionalString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return readRequiredString(value, label);
}

function readBroadcastKind(value: unknown): BroadcastKind {
  if (value !== "tv" && value !== "streaming") {
    throw new Error("broadcasts[].kind must be tv or streaming");
  }

  return value;
}

export function parseMatchBroadcastInput(raw: unknown): MatchBroadcastInput {
  assertObject(raw, "input");

  if (!Array.isArray(raw.broadcasts)) {
    throw new Error("broadcasts must be an array");
  }

  return {
    broadcasts: raw.broadcasts.map((broadcast, index) => {
      assertObject(broadcast, `broadcasts[${index}]`);

      return {
        kind: readBroadcastKind(broadcast.kind),
        service_name: readRequiredString(
          broadcast.service_name,
          `broadcasts[${index}].service_name`,
        ),
        url: readRequiredString(broadcast.url, `broadcasts[${index}].url`),
      };
    }),
    match_id: readRequiredString(raw.match_id, "match_id"),
    source_url: readOptionalString(raw.source_url, "source_url"),
  };
}

async function loadMatchSummary(
  db: SupabaseClient<Database>,
  matchId: string,
): Promise<MatchSummary> {
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        home_team:teams!matches_home_team_id_fkey (name),
        away_team:teams!matches_away_team_id_fkey (name)
      `,
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Match not found: ${matchId}`);
  }

  return data as MatchSummary;
}

export function buildMatchBroadcastRows(
  input: MatchBroadcastInput,
  verifiedAt: Date,
): Database["public"]["Tables"]["match_broadcasts"]["Insert"][] {
  return input.broadcasts.map((broadcast, index) => ({
    display_order: index,
    kind: broadcast.kind,
    match_id: input.match_id,
    service_name: broadcast.service_name,
    source_url: input.source_url,
    url: broadcast.url,
    verified_at: verifiedAt.toISOString(),
  }));
}

export async function upsertMatchBroadcastsForInput({
  confirm,
  db,
  input,
  logger = console,
  now = () => new Date(),
}: UpsertDeps & {
  input: MatchBroadcastInput;
}): Promise<UpsertMatchBroadcastsResult> {
  const match = await loadMatchSummary(db, input.match_id);

  logger.log(
    `Target match: ${match.home_team?.name ?? "Unknown"} vs ${match.away_team?.name ?? "Unknown"} (${match.kickoff_at})`,
  );
  logger.log(`Broadcast rows: ${input.broadcasts.length}`);

  if (confirm) {
    const approved = await confirm(match, input);

    if (!approved) {
      throw new Error("Aborted by user.");
    }
  }

  const rows = buildMatchBroadcastRows(input, now());
  const { data, error } = await db
    .from("match_broadcasts")
    .upsert(rows, { onConflict: "match_id,service_name" })
    .select("id");

  if (error) {
    throw error;
  }

  const upserted = data?.length ?? rows.length;
  logger.log(`Upserted match_broadcasts rows: ${upserted}`);

  return {
    matchId: input.match_id,
    upserted,
  };
}

async function readInputFile(path: string): Promise<MatchBroadcastInput> {
  const raw = await readFile(path, "utf8");
  return parseMatchBroadcastInput(JSON.parse(raw));
}

export function shouldRunUpsertMatchBroadcastsCli(
  argv = process.argv,
): boolean {
  return argv[1]?.endsWith("upsert-match-broadcasts.ts") ?? false;
}

export function logCliInputSummary({
  filePath,
  input,
  logger = console,
}: {
  filePath: string;
  input: MatchBroadcastInput;
  logger?: Logger;
}) {
  logger.log(`Input file: ${filePath}`);
  logger.log(`Target match ID: ${input.match_id}`);
  logger.log(`Broadcast count: ${input.broadcasts.length}`);
}

async function confirmOnTty(
  match: MatchSummary,
  parsed: MatchBroadcastInput,
): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `Upsert ${parsed.broadcasts.length} broadcast(s) for ${match.id}? Type "yes" to continue: `,
    );

    return answer.trim() === "yes";
  } finally {
    rl.close();
  }
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error(
      "Usage: node --env-file=.env.production.local tools/run-ts.cjs tools/upsert-match-broadcasts.ts <json file>",
    );
    process.exit(1);
  }

  const parsed = await readInputFile(filePath);
  logCliInputSummary({ filePath, input: parsed });
  await upsertMatchBroadcastsForInput({
    confirm: confirmOnTty,
    db: getSupabaseServerClient(),
    input: parsed,
  });
}

if (shouldRunUpsertMatchBroadcastsCli()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
