/**
 * Generates stable Japanese display names for players whose name_ja is empty.
 *
 * A 20-player dry run is the default. It calls MODELS.FAST but does not write.
 * Apply only after Owner review:
 *   node --env-file=.env.production.local tools/run-ts.cjs tools/backfill-player-name-ja.ts --limit=20 --confirm-owner-approved
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { MODELS } from "@/lib/llm/models";
import { createTextResponse } from "@/lib/llm/openai";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LIMIT = 20;
// One MODELS.FAST request per 20 players keeps the one-time backfill bounded.
const BATCH_SIZE = 20;
const USAGE =
  "Usage: node --env-file=.env.production.local tools/run-ts.cjs tools/backfill-player-name-ja.ts [--limit=N] [--confirm-owner-approved]";

export type PlayerNameJaBackfillOptions = {
  apply: boolean;
  limit: number;
};

export type PlayerNameJaCandidate = {
  country: string | null;
  id: string;
  name: string;
  name_ja: string | null;
};

export type GeneratedPlayerNameJa = {
  name_ja: string;
  player_id: string;
};

type NameGeneratorResponse = {
  model: string;
  names: GeneratedPlayerNameJa[];
  usage: { inputTokens: number; outputTokens: number };
};

export function parseOptions(argv: string[]): PlayerNameJaBackfillOptions {
  let apply = false;
  let limit = DEFAULT_LIMIT;

  for (const arg of argv) {
    if (arg === "--confirm-owner-approved") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10);
      continue;
    }
    throw new Error(USAGE);
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(USAGE);
  }

  return { apply, limit };
}

export function buildPlayerNameJaPrompt(
  players: PlayerNameJaCandidate[],
): string {
  return [
    "あなたは日本語ラグビーメディアの編集者です。各選手の安定した日本語表記を決めてください。",
    "英語読みだけで機械的にカタカナ化せず、所属チームの国からアフリカーンス語・マオリ語・パシフィカ系などの言語背景を考慮すること。",
    "例: Wilco Louw は「ラウ」、Paul de Villiers は「デ・ヴィリアーズ」、Ruan Nortjé は「ノルチェ」。",
    "既存の表記を変える処理ではない。渡された player_id ごとに1つだけ日本語表記を返すこと。",
    `入力: ${JSON.stringify(players.map(({ country, id, name }) => ({ country, id, name })))} `,
    'JSONのみで返答: {"names":[{"player_id":"...","name_ja":"..."}]}',
  ].join("\n\n");
}

export function parseGeneratedPlayerNames(
  text: string,
  candidates: PlayerNameJaCandidate[],
): GeneratedPlayerNameJa[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Player name generator returned invalid JSON");
  }

  const names =
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { names?: unknown }).names)
      ? (parsed as { names: unknown[] }).names
      : null;
  if (!names) {
    throw new Error("Player name generator response is missing names");
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const generated = names.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const playerId = (item as { player_id?: unknown }).player_id;
    const nameJa = (item as { name_ja?: unknown }).name_ja;
    if (
      typeof playerId !== "string" ||
      typeof nameJa !== "string" ||
      !candidateIds.has(playerId) ||
      nameJa.trim().length === 0
    ) {
      return [];
    }
    return [{ name_ja: nameJa.trim(), player_id: playerId }];
  });

  if (generated.length !== candidates.length) {
    throw new Error(
      "Player name generator did not return every requested player",
    );
  }
  if (
    new Set(generated.map((item) => item.player_id)).size !== generated.length
  ) {
    throw new Error("Player name generator returned duplicate player IDs");
  }

  return generated;
}

async function loadCandidates(
  db: SupabaseClient<Database>,
  limit: number,
): Promise<PlayerNameJaCandidate[]> {
  const { data, error } = await db
    .from("players")
    .select("id, name, name_ja, team:teams!players_team_id_fkey(country)")
    .or("name_ja.is.null,name_ja.eq.")
    .order("id", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((player) => ({
    country: player.team?.country ?? null,
    id: player.id,
    name: player.name,
    name_ja: player.name_ja,
  }));
}

async function applyNames(
  db: SupabaseClient<Database>,
  names: GeneratedPlayerNameJa[],
) {
  for (const name of names) {
    const { error } = await db
      .from("players")
      .update({ name_ja: name.name_ja })
      .eq("id", name.player_id)
      .or("name_ja.is.null,name_ja.eq.");

    if (error) {
      throw error;
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export async function runPlayerNameJaBackfill(
  options: PlayerNameJaBackfillOptions,
  dependencies: {
    db?: SupabaseClient<Database>;
    generate?: (
      players: PlayerNameJaCandidate[],
    ) => Promise<NameGeneratorResponse>;
  } = {},
) {
  const db = dependencies.db ?? getSupabaseServerClient();
  const generate =
    dependencies.generate ??
    (async (players: PlayerNameJaCandidate[]) => {
      const response = await createTextResponse({
        input: buildPlayerNameJaPrompt(players),
        jsonMode: true,
        model: MODELS.FAST,
      });
      return {
        model: response.model,
        names: parseGeneratedPlayerNames(response.text, players),
        usage: response.usage,
      };
    });
  const candidates = await loadCandidates(db, options.limit);
  const generated = [] as GeneratedPlayerNameJa[];
  let inputTokens = 0;
  let outputTokens = 0;
  let model: string | null = null;

  for (const batch of chunk(candidates, BATCH_SIZE)) {
    const response = await generate(batch);
    generated.push(...response.names);
    inputTokens += response.usage.inputTokens;
    outputTokens += response.usage.outputTokens;
    model = response.model;
  }

  if (options.apply) {
    await applyNames(db, generated);
  }

  return {
    applied: options.apply,
    candidates,
    generated,
    model,
    usage: { inputTokens, outputTokens },
  };
}

async function main() {
  const result = await runPlayerNameJaBackfill(
    parseOptions(process.argv.slice(2)),
  );
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith("backfill-player-name-ja.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
