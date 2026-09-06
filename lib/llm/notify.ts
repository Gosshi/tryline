import { getServerEnv, hasConfiguredValue } from "@/lib/env";

import type { BroadcastIngestResult } from "@/lib/broadcasts/ingest";
import type {
  ActionableDataIntegrityMatch,
  DataIntegrityAuditReport,
} from "@/lib/data-integrity/audit";
import type { ContentType, QaResult } from "@/lib/llm/types";

export type PrekickoffReadinessIssue = {
  issues: string[];
  kickoffAtJst: string;
  matchId: string;
  matchLabel: string;
};

export type ContentNotificationDiagnostics = {
  contentLength: number;
  contentLengthMinimum: number;
  contentLengthUnit: "characters" | "words";
  deterministicGuardIssues: string[];
  kickoffAtJst: string;
  lineupCount: number;
  matchLabel: string;
  sourcedFactsCount: number;
};

type ContentRejectedNotificationOptions = {
  contentLength?: number;
  diagnostics?: ContentNotificationDiagnostics;
  preservedPublished?: boolean;
};

const DISCORD_MESSAGE_CONTENT_LIMIT = 2_000;
const DISCORD_TRUNCATION_SUFFIX = "\n…(切り詰め)";
const MATCH_PAGE_URL_ORIGIN = "https://www.trylinerugby.com/matches";
const DATA_INTEGRITY_TEXT_MAX_LENGTH = 72;
const STALE_STANDINGS_DETAIL_LIMIT = 3;

/**
 * The number of published recaps listed in a weekly integrity report. Keeping
 * this bounded leaves room for the report summary within Discord's 2,000
 * character content limit.
 */
export const DATA_INTEGRITY_ACTION_ITEM_LIMIT = 4;

/**
 * Payload for a single match-level score-event mismatch alert.
 *
 * This intentionally does not depend on audit or database types so generation
 * gates can report an integrity failure before they invoke an LLM.
 */
export type EventIntegrityMismatchAlert = {
  actualAway: number;
  actualHome: number;
  competitionLabel?: string;
  expectedAway: number;
  expectedHome: number;
  matchId: string;
  matchLabel?: string;
};

function truncateDiscordMessageContent(text: string): string {
  if (text.length <= DISCORD_MESSAGE_CONTENT_LIMIT) {
    return text;
  }

  return `${text
    .slice(0, DISCORD_MESSAGE_CONTENT_LIMIT - DISCORD_TRUNCATION_SUFFIX.length)
    .trimEnd()}${DISCORD_TRUNCATION_SUFFIX}`;
}

function matchPageUrl(matchId: string): string {
  return `${MATCH_PAGE_URL_ORIGIN}/${matchId}`;
}

function shortenDataIntegrityText(text: string): string {
  if (text.length <= DATA_INTEGRITY_TEXT_MAX_LENGTH) {
    return text;
  }

  return `${text.slice(0, DATA_INTEGRITY_TEXT_MAX_LENGTH - 1)}…`;
}

function formatScoreMismatch(
  mismatch: NonNullable<ActionableDataIntegrityMatch["scoreMismatch"]>,
): string {
  return `スコア不一致: 最終 ${mismatch.expectedHome ?? "?"}–${mismatch.expectedAway ?? "?"} / イベント ${mismatch.actualHome}–${mismatch.actualAway}`;
}

function formatActionableDataIntegrityMatch(
  match: ActionableDataIntegrityMatch,
  index: number,
): string {
  const findings = [
    ...(match.scoreMismatch ? [formatScoreMismatch(match.scoreMismatch)] : []),
    ...match.duplicateEvents.map(
      (duplicate) =>
        `重複イベント: ${duplicate.matchingMatchCount}試合で同一（各${duplicate.eventCount}件）`,
    ),
  ];
  const context = [match.matchLabel, match.competitionLabel]
    .filter(Boolean)
    .map(shortenDataIntegrityText)
    .join(" — ");

  return [
    `${index + 1}. ${match.matchId}`,
    `   ${matchPageUrl(match.matchId)}`,
    ...(context ? [`   ${context}`] : []),
    ...findings.map((finding) => `   ${finding}`),
  ].join("\n");
}

function formatStaleStandings(
  report: DataIntegrityAuditReport,
): string {
  const competitions = report.staleStandings.competitions;

  if (competitions.length === 0) {
    return "なし";
  }

  const shown = competitions.slice(0, STALE_STANDINGS_DETAIL_LIMIT);
  const remaining = competitions.length - shown.length;

  return [
    shown
      .map(
        (competition) =>
          `${shortenDataIntegrityText(competition.slug)} (${competition.daysStale}日 stale)`,
      )
      .join(" / "),
    ...(remaining > 0 ? [`ほか${remaining}件`] : []),
  ].join(" / ");
}

async function postOpsAlert(text: string): Promise<void> {
  const { DISCORD_WEBHOOK_OPS } = getServerEnv();

  if (!DISCORD_WEBHOOK_OPS || !hasConfiguredValue(DISCORD_WEBHOOK_OPS)) {
    console.error("[content-pipeline] DISCORD_WEBHOOK_OPS is not configured");
    return;
  }

  try {
    const response = await fetch(DISCORD_WEBHOOK_OPS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: truncateDiscordMessageContent(text) }),
    });

    if (!response.ok) {
      console.error("[content-pipeline] failed to send Discord ops alert", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.error("[content-pipeline] failed to send Discord ops alert", error);
  }
}

export async function notifyContentRejected(
  matchId: string,
  contentType: ContentType,
  qaResult: QaResult,
  options: ContentRejectedNotificationOptions = {},
): Promise<void> {
  const diagnostics = options.diagnostics;
  const contentUnit =
    diagnostics?.contentLengthUnit === "words" ? "語" : "字";
  const message = [
    `⚠️ コンテンツ却下 [${contentType}]`,
    `試合ID: ${matchId}`,
    ...(diagnostics
      ? [
          `試合: ${diagnostics.matchLabel}`,
          `キックオフ: ${diagnostics.kickoffAtJst}`,
        ]
      : []),
    `QAスコア: 情報密度 ${qaResult.scores.information_density}/5 / 日本語品質 ${qaResult.scores.japanese_quality}/5 / 事実根拠 ${qaResult.scores.factual_grounding}/5 / 戦術的深さ(tactical_depth) ${qaResult.scores.tactical_depth}/5`,
    ...(diagnostics
      ? [
          `本文: ${diagnostics.contentLength}${contentUnit}（下限: ${diagnostics.contentLengthMinimum}${contentUnit}）`,
          `素材: sourced_facts ${diagnostics.sourcedFactsCount}件 / ラインアップ ${diagnostics.lineupCount}件`,
          `決定的ガード: ${diagnostics.deterministicGuardIssues.length > 0 ? diagnostics.deterministicGuardIssues.join(" / ") : "発火なし"}`,
        ]
      : []),
    `問題点: ${qaResult.issues.join(" / ")}`,
    ...(options.preservedPublished
      ? [
          "既存 published を温存: reject 産物はDBへ保存していません",
          `生成本文: ${options.contentLength ?? "不明"}字`,
        ]
      : []),
    "対応: Supabase Studio の match_content テーブルで status を確認し、必要に応じて published に変更してください",
  ].join("\n");

  await postOpsAlert(message);
}

export async function notifyPrekickoffReadinessAudit(
  issues: PrekickoffReadinessIssue[],
): Promise<void> {
  if (issues.length === 0) {
    return;
  }

  const details = issues.map(
    (issue, index) =>
      `${index + 1}. ${issue.matchLabel} — ${issue.kickoffAtJst}\n   ${issue.issues.join(" / ")}`,
  );
  const message = [
    "🧭 キックオフ前準備点検",
    `要対応: ${issues.length}試合`,
    ...details,
    "対応: preview・sourced_facts・match_lineups を確認し、必要な手動処理を実行してください",
  ].join("\n");

  await postOpsAlert(message);
}

export function getQaScoreRegressions(
  previous: QaResult["scores"],
  current: QaResult["scores"],
): Array<keyof QaResult["scores"]> {
  return (
    [
      "information_density",
      "japanese_quality",
      "factual_grounding",
      "tactical_depth",
    ] as const
  ).filter((key) => current[key] < previous[key]);
}

export async function notifyContentQualityRegression(options: {
  contentType: ContentType;
  currentContentLength: number;
  currentScores: QaResult["scores"];
  kickoffAtJst: string;
  matchLabel: string;
  previousContentLength: number;
  previousScores: QaResult["scores"];
}): Promise<void> {
  const regressions = getQaScoreRegressions(
    options.previousScores,
    options.currentScores,
  );

  if (regressions.length === 0) {
    return;
  }

  const message = [
    `⚠️ コンテンツ品質回帰 [${options.contentType}]`,
    `試合: ${options.matchLabel}`,
    `キックオフ: ${options.kickoffAtJst}`,
    `QAスコア: 情報密度 ${options.previousScores.information_density}→${options.currentScores.information_density} / 日本語品質 ${options.previousScores.japanese_quality}→${options.currentScores.japanese_quality} / 事実根拠 ${options.previousScores.factual_grounding}→${options.currentScores.factual_grounding} / 戦術的深さ(tactical_depth) ${options.previousScores.tactical_depth}→${options.currentScores.tactical_depth}`,
    `本文: ${options.previousContentLength}字→${options.currentContentLength}字`,
    `低下項目: ${regressions.join(" / ")}`,
    "対応: match_content の既存 published と今回の生成結果を比較してください",
  ].join("\n");

  await postOpsAlert(message);
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

  await postOpsAlert(message);
}

export async function notifyDataIntegrityReport(
  report: DataIntegrityAuditReport,
): Promise<void> {
  const actionableMatches = report.actionableMatches ?? [];
  const shownActionableMatches = actionableMatches.slice(
    0,
    DATA_INTEGRITY_ACTION_ITEM_LIMIT,
  );
  const remainingActionableMatchCount =
    actionableMatches.length - shownActionableMatches.length;
  const staleStandings = formatStaleStandings(report);
  const message = [
    "🧪 データ整合性 週次監査",
    `生成日時: ${report.generatedAt}`,
    `要対応: ${actionableMatches.length}件（published recapに影響）`,
    ...(actionableMatches.length === 0
      ? ["要対応の試合はありません"]
      : shownActionableMatches.map(formatActionableDataIntegrityMatch)),
    ...(remainingActionableMatchCount > 0
      ? [
          `要対応の表示は先頭${DATA_INTEGRITY_ACTION_ITEM_LIMIT}件までです。残り${remainingActionableMatchCount}件`,
        ]
      : []),
    "継続状況: 初回検出時刻は不明です（履歴を保持していないため）",
    `1. 重複イベント: groups=${report.duplicateEvents.groupCount} matches=${report.duplicateEvents.matchCount}`,
    `2. スコア不一致: matches=${report.scoreMismatches.count}`,
    `3. finished イベント0件: matches=${report.emptyFinishedEvents.count}`,
    `4. draft滞留: total=${report.draftBacklog.total} recent7d=${report.draftBacklog.recent7Days}`,
    `5. 順位表 stale: competitions=${report.staleStandings.count} ${staleStandings}`,
    "記録: published recapのない試合、draftのみの試合、および他の監査項目は上記件数を参照してください",
    "対応: 要対応の試合URLから記録と公開済みrecapを確認し、修正は個別specで対応してください",
  ].join("\n");

  await postOpsAlert(message);
}

/** Sends a single actionable mismatch alert for the recap generation gate. */
export async function notifyEventIntegrityMismatch(
  alert: EventIntegrityMismatchAlert,
): Promise<void> {
  const context = [alert.matchLabel, alert.competitionLabel]
    .filter((value): value is string => Boolean(value))
    .map(shortenDataIntegrityText)
    .join(" — ");
  const message = [
    "⚠️ 得点イベント整合性不一致のためrecap生成を停止",
    `試合ID: ${alert.matchId}`,
    `試合URL: ${matchPageUrl(alert.matchId)}`,
    ...(context ? [`試合: ${context}`] : []),
    `最終スコア: ${alert.expectedHome}–${alert.expectedAway}`,
    `イベント合計: ${alert.actualHome}–${alert.actualAway}`,
    "対応: 試合記録を確認し、イベントの再取得または修正は個別specに従って判断してください",
  ].join("\n");

  await postOpsAlert(message);
}

export async function notifyBroadcastIngestReport(
  result: BroadcastIngestResult,
): Promise<void> {
  const linked =
    result.linked.length === 0
      ? "なし"
      : result.linked
          .map((broadcast) => `${broadcast.label}: ${broadcast.serviceName}`)
          .join(" / ");
  const unknownServices =
    result.unknownServices.length === 0
      ? "なし"
      : result.unknownServices
          .map((broadcast) => broadcast.serviceName)
          .join(" / ");
  const missingMatches =
    result.matchesStillMissing.length === 0
      ? "なし"
      : result.matchesStillMissing
          .map((match) => `${match.label} (${match.kickoffAt})`)
          .join(" / ");
  const unlinkedPages =
    result.unlinkedPages.length === 0
      ? "なし"
      : result.unlinkedPages
          .map((page) => `${page.dateLabel}: ${page.reason}`)
          .join(" / ");
  const message = [
    "📺 放送情報 自動取得",
    `生成日時: ${result.generatedAt}`,
    `1. 投入候補: ${result.linked.length}件 ${linked}`,
    `2. 未対応サービス: ${result.unknownServices.length}件 ${unknownServices}`,
    `3. 紐付け不可ページ: ${result.unlinkedPages.length}件 ${unlinkedPages}`,
    `4. 14日以内で放送情報なし: ${result.matchesStillMissing.length}件 ${missingMatches}`,
  ].join("\n");

  await postOpsAlert(message);
}

export async function notifyNewsletterDelivery(
  result: { failed: number; sent: number; skipped: boolean },
): Promise<void> {
  const message = [
    "✉️ 週次ニュースレター配信",
    `成功: ${result.sent}件`,
    `失敗: ${result.failed}件`,
    `Resend未設定のためスキップ: ${result.skipped ? "はい" : "いいえ"}`,
  ].join("\n");

  await postOpsAlert(message);
}

export async function notifyStripeWebhookIssue(options: {
  eventId: string;
  eventType: string;
  issueCode:
    | "missing_user_id"
    | "subscription_delete_failed"
    | "subscription_upsert_failed";
  userId?: string;
}): Promise<void> {
  const message = [
    "🚨 Stripe webhook requires attention",
    `Event ID: ${options.eventId}`,
    `Event type: ${options.eventType}`,
    `User ID: ${options.userId ?? "missing"}`,
    `Issue: ${options.issueCode}`,
    "対応: Stripe Dashboard のイベントIDを確認し、user_profiles の権限を調査してください",
  ].join("\n");

  await postOpsAlert(message);
}
