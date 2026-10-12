import { authorizeOpsRequest } from "@/lib/auth/ops";
import { getSupabaseServerClient } from "@/lib/db/server";
import { isUuid } from "@/lib/ids";
import { generateMatchContent } from "@/lib/llm/pipeline";
import { decideManualFactRegeneration } from "@/lib/sourced-facts/manual-entry";

import type { ContentType } from "@/lib/llm/types";

export const maxDuration = 300;
export async function POST(request: Request) {
  const denied = await authorizeOpsRequest(request);
  if (denied) return denied;
  const input = await request.json().catch(() => null);
  if (!input || typeof input.matchId !== "string" || !isUuid(input.matchId))
    return Response.json(
      { error: "試合 ID を確認してください。" },
      { status: 400 },
    );
  const { data: match, error } = await getSupabaseServerClient()
    .from("matches")
    .select("kickoff_at")
    .eq("id", input.matchId)
    .maybeSingle();
  if (error) throw error;
  if (!match)
    return Response.json({
      status: "none",
      message: "対象の試合が見つかりません。",
    });
  const contentType: ContentType =
    new Date(match.kickoff_at).getTime() > Date.now() ? "preview" : "recap";
  if (
    (await decideManualFactRegeneration({
      matchId: input.matchId,
      contentType,
    })) === "none"
  )
    return Response.json({
      status: "none",
      message: "作り直しの対象ではありません。",
    });
  const contentLabel = contentType === "preview" ? "プレビュー" : "レビュー";
  try {
    const result = await generateMatchContent(input.matchId, contentType, "ja");
    if (result.status === "published")
      return Response.json({
        status: "published",
        message: `${contentLabel}を作り直しました（公開）`,
      });
    if (result.status === "draft")
      return Response.json({
        status: "draft",
        message: `${contentLabel}を作り直しましたが、QA で不合格のため公開中の版を残しました`,
      });
    const reason =
      result.skipReason === "events_unavailable"
        ? "試合イベントがありません"
        : result.skipReason === "score_mismatch"
          ? "得点イベントとスコアが一致しません"
          : "生成処理でスキップされました";
    return Response.json({
      status: "skipped",
      message: `作り直しを見送りました: ${reason}`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "不明なエラー";
    return Response.json({
      status: "failed",
      message: `${contentLabel}の作り直しに失敗しました: ${reason}`,
    });
  }
}
