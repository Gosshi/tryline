import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/db/server";
import { splitBulkResearchPaste } from "@/lib/ops/bulk-research-paste";

import type { ContentType } from "@/lib/llm/types";

export const bulkPasteInput = z.object({ text: z.string().max(100000) });
export type OpsMatch = {
  id: string;
  kickoff_at: string;
  status: string;
  home_team: { name: string; name_ja: string | null };
  away_team: { name: string; name_ja: string | null };
};

export async function loadBulkFactPreview(text: string) {
  const parsed = splitBulkResearchPaste(text);
  const ids = [
    ...new Set(
      parsed.blocks.flatMap((block) => (block.matchId ? [block.matchId] : [])),
    ),
  ];
  const matches = new Map<string, OpsMatch>();
  if (ids.length) {
    const { data, error } = await getSupabaseServerClient()
      .from("matches")
      .select(
        "id, kickoff_at, status, home_team:teams!matches_home_team_id_fkey(name, name_ja), away_team:teams!matches_away_team_id_fkey(name, name_ja)",
      )
      .in("id", ids);
    if (error) throw error;
    for (const match of (data ?? []) as unknown as OpsMatch[])
      matches.set(match.id.toLowerCase(), match);
  }
  return {
    linesBeforeFirstHeading: parsed.linesBeforeFirstHeading,
    blocks: parsed.blocks.map((block) => {
      const match = block.matchId
        ? (matches.get(block.matchId.toLowerCase()) ?? null)
        : null;
      const factCount = block.paste.sources.reduce(
        (count, source) => count + source.facts.length,
        0,
      );
      const reason = !block.matchId
        ? "見出しに試合 URL がありません。"
        : !match
          ? "対象の試合が見つかりません。"
          : !factCount
            ? "保存できる事実がありません。"
            : null;
      const contentType: ContentType | null = match
        ? new Date(match.kickoff_at).getTime() > Date.now()
          ? "preview"
          : "recap"
        : null;
      return {
        ...block,
        match,
        contentType,
        factCount,
        sourceCount: block.paste.sources.length,
        skippedLines: block.paste.skippedLines,
        reason,
      };
    }),
  };
}

export type BulkFactPreview = Awaited<ReturnType<typeof loadBulkFactPreview>>;
export type OpsFactSaveRow = {
  matchId: string | null;
  heading: string;
  savedCount: number;
  duplicateCount: number;
  rejectedSources: Array<{ sourceUrl: string; reason: string }>;
  reason: string | null;
  regeneration: "regenerate" | "generate" | "none";
  contentType: ContentType | null;
};
export type OpsRegenerationResult = {
  status: "published" | "draft" | "skipped" | "failed" | "none";
  message: string;
};

export type OpsFactPreview = Omit<BulkFactPreview, "blocks"> & {
  blocks: Array<Omit<BulkFactPreview["blocks"][number], "paste">>;
};
