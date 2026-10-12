import { authorizeOpsRequest } from "@/lib/auth/ops";
import { isLeagueOneMatch } from "@/lib/cron/league-one";
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
    .select("kickoff_at, competition:competitions!matches_competition_id_fkey (family)")
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
  const action = await decideManualFactRegeneration({
    matchId: input.matchId,
    contentType,
  });
  if (action === "none")
    return Response.json({
      status: "none",
      message: "作り直しの対象ではありません。",
    });
  const contentLabel = contentType === "preview" ? "プレビュー" : "レビュー";
  try {
    const result = await generateMatchContent(input.matchId, contentType, "ja");
    if (
      action === "generate" &&
      isLeagueOneMatch(match.competition) &&
      result.status !== "skipped"
    ) {
      try {
        await generateMatchContent(input.matchId, contentType, "en");
      } catch (englishError) {
        console.error("[ops facts] League One English generation failed", englishError);
      }
    }
    if (result.status === "published")
      return Response.json({
        status: "published",
        message: `${contentLabel}を${action === "generate" ? "作りました" : "作り直しました"}（公開）`,
      });
    if (result.status === "draft")
      return Response.json({
        status: "draft",
        message: action === "generate"
          ? `${contentLabel}を作りましたが、QA で不合格のため下書きにしました`
          : `${contentLabel}を作り直しましたが、QA で不合格のため公開中の版を残しました`,
      });
    const reason =
      result.skipReason === "events_unavailable"
        ? "試合イベントがありません"
        : result.skipReason === "score_mismatch"
          ? "得点イベントとスコアが一致しません"
          : "生成処理でスキップされました";
    return Response.json({
      status: "skipped",
      message: `${action === "generate" ? "生成" : "作り直し"}を見送りました: ${reason}`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "不明なエラー";
    return Response.json({
      status: "failed",
      message: `${contentLabel}の${action === "generate" ? "生成" : "作り直し"}に失敗しました: ${reason}`,
    });
  }
}
