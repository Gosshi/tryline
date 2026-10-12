import { authorizeOpsRequest } from "@/lib/auth/ops";
import { bulkPasteInput, loadBulkFactPreview } from "@/lib/ops/facts";
import {
  decideManualFactRegeneration,
  saveManualResearchFacts,
} from "@/lib/sourced-facts/manual-entry";

import type { OpsFactSaveRow } from "@/lib/ops/facts";

export async function POST(request: Request) {
  const denied = await authorizeOpsRequest(request);
  if (denied) return denied;
  const input = bulkPasteInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return Response.json(
      { error: "入力内容を確認してください（100,000字まで）。" },
      { status: 400 },
    );
  const preview = await loadBulkFactPreview(input.data.text);
  const results: OpsFactSaveRow[] = [];
  // Process matches sequentially: each save validates at most four source URLs.
  for (const block of preview.blocks) {
    if (block.reason || !block.matchId) {
      results.push({
        matchId: block.matchId,
        heading: block.heading,
        savedCount: 0,
        duplicateCount: 0,
        rejectedSources: [],
        reason: block.reason,
        regeneration: "none",
        contentType: block.contentType,
      });
      continue;
    }
    const saved = await saveManualResearchFacts({
      matchId: block.matchId,
      paste: block.paste,
      entryPath: "ops_bulk_paste",
    });
    const regeneration =
      saved.savedCount > 0 && saved.contentType
        ? await decideManualFactRegeneration({
            matchId: block.matchId,
            contentType: saved.contentType,
          })
        : "none";
    results.push({
      matchId: block.matchId,
      heading: block.heading,
      savedCount: saved.savedCount,
      duplicateCount: saved.duplicateCount,
      rejectedSources: saved.rejectedSources,
      reason: saved.matchMissing ? "対象の試合が見つかりません。" : null,
      regeneration,
      contentType: saved.contentType,
    });
  }
  return Response.json({ results });
}
