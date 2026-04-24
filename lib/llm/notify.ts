import { getServerEnv, hasConfiguredValue } from "@/lib/env";

import type { ContentType, QaResult } from "@/lib/llm/types";

async function postToSlack(text: string): Promise<void> {
  const { SLACK_WEBHOOK_URL } = getServerEnv();

  if (!SLACK_WEBHOOK_URL || !hasConfiguredValue(SLACK_WEBHOOK_URL)) {
    console.warn("[content-pipeline] slack webhook is not configured");
    return;
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error("[content-pipeline] failed to send slack notification", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.error("[content-pipeline] failed to send slack notification", error);
  }
}

export async function notifyContentRejected(
  matchId: string,
  contentType: ContentType,
  qaResult: QaResult,
): Promise<void> {
  const message = [
    `⚠️ コンテンツ却下 [${contentType}]`,
    `試合ID: ${matchId}`,
    `QAスコア: 情報密度 ${qaResult.scores.information_density}/5 / 日本語品質 ${qaResult.scores.japanese_quality}/5 / 事実根拠 ${qaResult.scores.factual_grounding}/5`,
    `問題点: ${qaResult.issues.join(" / ")}`,
    "対応: Supabase Studio の match_content テーブルで status を確認し、必要に応じて published に変更してください",
  ].join("\n");

  await postToSlack(message);
}

export async function notifyCostAlert(
  matchId: string,
  contentType: ContentType,
  totalCostUsd: number,
  thresholdUsd: number,
): Promise<void> {
  const message = [
    `💸 コストアラート [${contentType}]`,
    `試合ID: ${matchId}`,
    `累積コスト: $${totalCostUsd.toFixed(4)}（閾値: $${thresholdUsd}）`,
    "pipeline_runs テーブルを確認し、異常なトークン消費がないか調査してください",
  ].join("\n");

  await postToSlack(message);
}
