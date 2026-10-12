import { authorizeOpsRequest } from "@/lib/auth/ops";
import { bulkPasteInput, loadBulkFactPreview } from "@/lib/ops/facts";

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
  return Response.json({
    ...preview,
    blocks: preview.blocks.map((block) => ({
      heading: block.heading,
      headingLine: block.headingLine,
      matchId: block.matchId,
      match: block.match,
      contentType: block.contentType,
      factCount: block.factCount,
      sourceCount: block.sourceCount,
      skippedLines: block.skippedLines,
      reason: block.reason,
    })),
  });
}
