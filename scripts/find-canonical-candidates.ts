import { createClient } from "@supabase/supabase-js";
import { toRomaji } from "wanakana";

import type { Database } from "@/lib/db/types";

type PlayerRow = {
  id: string;
  name: string;
  slug: string;
  team: { name: string } | { name: string }[] | null;
};

type ScoredCandidate = {
  player: PlayerRow;
  score: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, row) =>
    Array.from({ length: b.length + 1 }, (_, column) => {
      if (row === 0) {
        return column;
      }

      if (column === 0) {
        return row;
      }

      return 0;
    }),
  );

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      dp[row]![column] =
        a[row - 1] === b[column - 1]
          ? dp[row - 1]![column - 1]!
          : 1 +
            Math.min(
              dp[row - 1]![column]!,
              dp[row]![column - 1]!,
              dp[row - 1]![column - 1]!,
            );
    }
  }

  return dp[a.length]![b.length]!;
}

function similarity(a: string, b: string): number {
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;

  if (longer.length === 0) {
    return 1;
  }

  return (longer.length - levenshtein(longer, shorter)) / longer.length;
}

function isKatakanaDominant(name: string): boolean {
  const chars = name.replace(/[\s・]/g, "").split("");
  const katakana = chars.filter((char) => char >= "゠" && char <= "ヿ");

  return chars.length > 0 && katakana.length / chars.length > 0.5;
}

function toSlugCandidate(name: string): string {
  return toRomaji(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripSuffix(slug: string): string {
  return slug.replace(/-\d+$/, "");
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function teamNameFor(player: PlayerRow): string {
  return firstRelation(player.team)?.name ?? "";
}

function buildCandidateBlock(player: PlayerRow, scored: ScoredCandidate[]) {
  const best = scored[0];

  if (!best) {
    return "";
  }

  const extraCandidates = scored
    .slice(1)
    .map(
      ({ player: candidate, score }, index) =>
        `  ${index + 2}. \`${candidate.slug}\` (${teamNameFor(candidate)}) — ${score.toFixed(2)}`,
    );
  const lines = [
    `### ${player.name} → ${best.player.slug}`,
    `- uuid スラグ: \`${player.slug}\` (${teamNameFor(player)})`,
    `- 候補スラグ: \`${best.player.slug}\` (${teamNameFor(best.player)})`,
    `- スコア: ${best.score.toFixed(2)}`,
  ];

  if (extraCandidates.length > 0) {
    lines.push("- その他候補:", ...extraCandidates);
  }

  lines.push(
    `- SQL: \`UPDATE players SET canonical_player_id = '${best.player.id}' WHERE id = '${player.id}';\``,
    "",
  );

  return lines.join("\n");
}

async function main() {
  const { data: uuidPlayers, error: uuidPlayersError } = await supabase
    .from("players")
    .select("id, name, slug, team:teams!players_team_id_fkey(name)")
    .like("slug", "player-%")
    .is("canonical_player_id", null)
    .order("name");

  if (uuidPlayersError) {
    throw uuidPlayersError;
  }

  const { data: canonicalPlayers, error: canonicalPlayersError } =
    await supabase
      .from("players")
      .select("id, name, slug, team:teams!players_team_id_fkey(name)")
      .not("slug", "like", "player-%")
      .is("canonical_player_id", null)
      .order("slug");

  if (canonicalPlayersError) {
    throw canonicalPlayersError;
  }

  const today = new Date().toISOString().slice(0, 10);
  const high: string[] = [];
  const mid: string[] = [];
  const unmatched: string[] = [];
  const candidates = (canonicalPlayers ?? []) as unknown as PlayerRow[];

  for (const player of (uuidPlayers ?? []) as unknown as PlayerRow[]) {
    const teamName = teamNameFor(player);

    if (!isKatakanaDominant(player.name)) {
      unmatched.push(
        `| ${markdownCell(player.name)} | ${player.slug} | ${markdownCell(teamName)} |`,
      );
      continue;
    }

    const slugCandidate = toSlugCandidate(player.name);
    const scored = candidates
      .map((candidate) => ({
        player: candidate,
        score: similarity(slugCandidate, stripSuffix(candidate.slug)),
      }))
      .filter(({ score }) => score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length === 0) {
      unmatched.push(
        `| ${markdownCell(player.name)} | ${player.slug} | ${markdownCell(teamName)} |`,
      );
      continue;
    }

    const block = buildCandidateBlock(player, scored);

    if (scored[0]!.score >= 0.8) {
      high.push(block);
    } else {
      mid.push(block);
    }
  }

  const lines = [
    `# canonical 候補レポート ${today}`,
    "",
    `## 高信頼度（スコア 0.8 以上） — ${high.length} 件`,
    "",
    ...high,
    `## 中信頼度（スコア 0.5〜0.8） — ${mid.length} 件`,
    "",
    ...mid,
    `## 未マッチ（漢字名または候補なし） — ${unmatched.length} 件`,
    "",
    "| 名前 | スラグ | チーム |",
    "|------|--------|--------|",
    ...unmatched,
  ];

  console.log(lines.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
