import { after } from "next/server";
import { createPublicKey, verify } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { parseResearchPaste } from "@/lib/discord/research-paste";
import {
  OWNER_VERIFIABLE_SOURCE_URL_STATUSES,
  validateSourceUrl,
} from "@/lib/discord/source-url";
import { getServerEnv } from "@/lib/env";
import {
  loadAllowedSourcedFactRows,
  selectSourcedFactsForGeneration,
} from "@/lib/llm/sourced-facts/fetch";

import type { ContentType } from "@/lib/llm/types";

export const runtime = "nodejs";

const DISCORD_PUBLIC_KEY_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex",
);
const EPHEMERAL = 1 << 6;
const RESEARCH_FACT_ENTRY_COMMAND_NAME = "調査事実を追加";
const RESEARCH_FACT_ENTRY_MODAL_PREFIX = "research-fact-entry";
const MATCH_CANDIDATE_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_MATCH_OPTIONS = 25;
const RESEARCH_MODAL_ID_PATTERN = new RegExp(
  `^${RESEARCH_FACT_ENTRY_MODAL_PREFIX}$`,
);

type DiscordInteraction = {
  application_id?: unknown;
  data?: {
    components?: unknown;
    custom_id?: unknown;
    name?: unknown;
    type?: unknown;
  };
  member?: { user?: { id?: unknown } };
  token?: unknown;
  type?: unknown;
  user?: { id?: unknown };
};

type TeamName = {
  name: string;
  name_ja: string | null;
};

type ResearchMatchCandidate = {
  away_team: TeamName | TeamName[] | null;
  home_team: TeamName | TeamName[] | null;
  id: string;
  kickoff_at: string;
};

function interactionResponse(content: string) {
  return Response.json({
    data: { content, flags: EPHEMERAL },
    type: 4,
  });
}

function deferredInteractionResponse() {
  return Response.json({
    data: { flags: EPHEMERAL },
    type: 5,
  });
}

function verifyDiscordSignature(params: {
  body: string;
  publicKey: string | undefined;
  signature: string | null;
  timestamp: string | null;
}) {
  if (!params.publicKey || !params.signature || !params.timestamp) {
    return false;
  }

  try {
    const publicKeyBytes = Buffer.from(params.publicKey, "hex");
    const signature = Buffer.from(params.signature, "hex");
    if (publicKeyBytes.length !== 32 || signature.length !== 64) {
      return false;
    }

    const key = createPublicKey({
      format: "der",
      key: Buffer.concat([DISCORD_PUBLIC_KEY_PREFIX, publicKeyBytes]),
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(`${params.timestamp}${params.body}`),
      key,
      signature,
    );
  } catch {
    return false;
  }
}

function getInteractionUserId(interaction: DiscordInteraction) {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  return typeof userId === "string" ? userId : null;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function truncateDiscordLabel(value: string) {
  const characters = [...value];
  return characters.length <= 100
    ? value
    : `${characters.slice(0, 99).join("")}…`;
}

function formatMatchDate(kickoffAt: string) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
  }).formatToParts(new Date(kickoffAt));
  const month = parts.find((part) => part.type === "month")?.value ?? "??";
  const day = parts.find((part) => part.type === "day")?.value ?? "??";
  return `${month}/${day}`;
}

function buildResearchFactEntryModal(matches: ResearchMatchCandidate[]) {
  const options = matches.map((match) => {
    const homeTeam = firstRelation(match.home_team);
    const awayTeam = firstRelation(match.away_team);
    const homeName = homeTeam?.name_ja ?? homeTeam?.name ?? "ホーム";
    const awayName = awayTeam?.name_ja ?? awayTeam?.name ?? "アウェイ";

    return {
      label: truncateDiscordLabel(
        `${formatMatchDate(match.kickoff_at)} ${homeName} × ${awayName}`,
      ),
      value: match.id,
    };
  });

  return Response.json({
    data: {
      components: [
        {
          component: {
            custom_id: "match_id",
            options,
            placeholder: "試合を選択",
            required: true,
            type: 3,
          },
          label: "試合",
          type: 18,
        },
        {
          component: {
            custom_id: "facts",
            max_length: 4_000,
            required: true,
            style: 2,
            type: 4,
          },
          description:
            "### 出典: から始まるブロックを、この試合の分だけ貼ってください。",
          label: "ChatGPT の出力（この試合の部分）",
          type: 18,
        },
      ],
      custom_id: RESEARCH_FACT_ENTRY_MODAL_PREFIX,
      title: "調査事実を追加",
    },
    type: 9,
  });
}

function findComponentValue(
  components: unknown,
  customId: string,
): string | null {
  const items = Array.isArray(components) ? components : [components];

  for (const component of items) {
    if (!component || typeof component !== "object") {
      continue;
    }
    const record = component as Record<string, unknown>;
    if (record.custom_id === customId) {
      if (typeof record.value === "string") {
        return record.value;
      }
      if (
        Array.isArray(record.values) &&
        typeof record.values[0] === "string"
      ) {
        return record.values[0];
      }
    }

    const nested = findComponentValue(record.components, customId);
    if (nested !== null) {
      return nested;
    }
    const nestedComponent = findComponentValue(record.component, customId);
    if (nestedComponent !== null) {
      return nestedComponent;
    }
  }

  return null;
}

function truncateDiscordFact(value: string) {
  const characters = [...value];
  return characters.length <= 40
    ? value
    : `${characters.slice(0, 39).join("")}…`;
}

function formatManualFactsGenerationNotice(params: {
  droppedManual: Array<{ fact: string }>;
  manualTotal: number;
  prefix: string;
}) {
  if (params.manualTotal <= 8) {
    return params.prefix;
  }
  if (params.droppedManual.length === 0) {
    return `${params.prefix}\nこの試合の手動事実は${params.manualTotal}件です。全件が生成に使われ、自動取得の事実は使われません。`;
  }

  const notice = `この試合の手動事実は${params.manualTotal}件で、生成に使われるのは新しい順に16件です。次の${params.droppedManual.length}件は使われません:`;
  const lines: string[] = [];
  let listed = 0;
  for (const fact of params.droppedManual) {
    const line = `- ${truncateDiscordFact(fact.fact)}`;
    const remaining = params.droppedManual.length - listed - 1;
    const suffix = remaining > 0 ? `\n…ほか${remaining}件` : "";
    if (
      `${params.prefix}\n${notice}\n${[...lines, line].join("\n")}${suffix}`
        .length > 2_000
    ) {
      break;
    }
    lines.push(line);
    listed += 1;
  }
  const remaining = params.droppedManual.length - listed;
  const suffix = remaining > 0 ? `\n…ほか${remaining}件` : "";
  return `${params.prefix}\n${notice}\n${lines.join("\n")}${suffix}`;
}

function parseResearchModalSubmission(interaction: DiscordInteraction) {
  if (
    interaction.type !== 5 ||
    typeof interaction.data?.custom_id !== "string" ||
    !RESEARCH_MODAL_ID_PATTERN.test(interaction.data.custom_id)
  ) {
    return null;
  }

  const matchId = findComponentValue(interaction.data.components, "match_id");
  const factsValue = findComponentValue(interaction.data.components, "facts");

  if (!matchId || !factsValue) {
    return null;
  }

  return {
    paste: parseResearchPaste(factsValue),
    matchId,
  };
}

function formatSkippedResearchLines(
  skippedLines: ReturnType<typeof parseResearchPaste>["skippedLines"],
) {
  if (skippedLines.length === 0) {
    return "";
  }
  const lines = skippedLines.map(({ lineNumber, reason }) => {
    const label =
      reason === "note"
        ? "注記"
        : reason === "too_long"
          ? "300字超"
          : "出典ブロック外";
    return `${lineNumber}行目（${label}）`;
  });
  return `\n読み飛ばした行: ${lines.join("、")}`;
}

async function openResearchFactEntryModal(interaction: DiscordInteraction) {
  if (
    interaction.data?.name !== RESEARCH_FACT_ENTRY_COMMAND_NAME ||
    interaction.data.type !== 1
  ) {
    return interactionResponse("未対応のDiscord操作です。");
  }

  const now = Date.now();
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("matches")
    .select(
      "id, kickoff_at, home_team:teams!matches_home_team_id_fkey(name, name_ja), away_team:teams!matches_away_team_id_fkey(name, name_ja)",
    )
    .gte("kickoff_at", new Date(now - MATCH_CANDIDATE_WINDOW_MS).toISOString())
    .lte("kickoff_at", new Date(now + MATCH_CANDIDATE_WINDOW_MS).toISOString());

  if (error) {
    throw error;
  }

  const candidates = ((data ?? []) as unknown as ResearchMatchCandidate[])
    .filter(
      (match) =>
        typeof match.id === "string" &&
        Number.isFinite(new Date(match.kickoff_at).getTime()),
    )
    .sort((left, right) => {
      const leftKickoff = new Date(left.kickoff_at).getTime();
      const rightKickoff = new Date(right.kickoff_at).getTime();
      return (
        Math.abs(leftKickoff - now) - Math.abs(rightKickoff - now) ||
        leftKickoff - rightKickoff
      );
    })
    .slice(0, MAX_MATCH_OPTIONS);

  if (candidates.length === 0) {
    return interactionResponse("前後2週間以内の試合が見つかりません。");
  }

  return buildResearchFactEntryModal(candidates);
}

async function processResearchFactEntry(interaction: DiscordInteraction) {
  const submission = parseResearchModalSubmission(interaction);
  if (!submission) {
    return "入力内容を確認してください。";
  }
  const skippedSummary = formatSkippedResearchLines(
    submission.paste.skippedLines,
  );
  if (submission.paste.sources.length === 0) {
    return `保存できる事実がありませんでした。出典のブロックが見つかりません。${skippedSummary}`;
  }

  const sourceBlocks = submission.paste.sources.filter(
    (source) => source.facts.length > 0,
  );
  if (sourceBlocks.length === 0) {
    return `保存できる事実がありませんでした。読み取れる事実がありません。${skippedSummary}`;
  }

  const validatedSources = new Map<
    string,
    Awaited<ReturnType<typeof validateSourceUrl>>
  >();
  for (const source of sourceBlocks) {
    if (!validatedSources.has(source.sourceUrl)) {
      validatedSources.set(
        source.sourceUrl,
        await validateSourceUrl(source.sourceUrl),
      );
    }
  }

  const rejectedSources: Array<{ sourceUrl: string; reason: string }> = [];
  const ownerVerifiedSources: Array<{
    sourceDomain: string;
    sourceUrl: string;
    status: number;
  }> = [];
  const rows: Array<{
    confidence: "high";
    fact: string;
    fact_ja: string;
    match_id: string;
    metadata: {
      entry_method: "manual";
      entry_path: "discord_research_paste";
      source_url_check?: "owner_verified";
      source_url_http_status?: number;
    };
    model_version: "manual";
    source_domain: string;
    source_url: string;
  }> = [];
  const acceptedSourceUrls = new Set<string>();
  for (const source of sourceBlocks) {
    const validation = validatedSources.get(source.sourceUrl);
    if (!validation) continue;
    const ownerVerifiedStatus =
      !validation.ok &&
      validation.status !== null &&
      OWNER_VERIFIABLE_SOURCE_URL_STATUSES.has(validation.status)
        ? validation.status
        : null;
    if (!validation.ok && ownerVerifiedStatus === null) {
      if (
        !rejectedSources.some(
          (rejected) => rejected.sourceUrl === source.sourceUrl,
        )
      ) {
        rejectedSources.push({
          sourceUrl: source.sourceUrl,
          reason: validation.reason,
        });
      }
      continue;
    }

    acceptedSourceUrls.add(source.sourceUrl);
    const sourceDomain = validation.ok
      ? validation.sourceDomain
      : new URL(source.sourceUrl).hostname;
    if (
      ownerVerifiedStatus !== null &&
      !ownerVerifiedSources.some(
        (verified) => verified.sourceUrl === source.sourceUrl,
      )
    ) {
      ownerVerifiedSources.push({
        sourceDomain,
        sourceUrl: source.sourceUrl,
        status: ownerVerifiedStatus,
      });
    }
    for (const { fact } of source.facts) {
      rows.push({
        confidence: "high",
        fact,
        fact_ja: fact,
        match_id: submission.matchId,
        metadata: {
          entry_method: "manual",
          entry_path: "discord_research_paste",
          ...(ownerVerifiedStatus === null
            ? {}
            : {
                source_url_check: "owner_verified",
                source_url_http_status: ownerVerifiedStatus,
              }),
        },
        model_version: "manual",
        source_domain: sourceDomain,
        source_url: source.sourceUrl,
      });
    }
  }

  if (rows.length === 0) {
    return (
      [
        "保存できる事実がありませんでした。",
        ...rejectedSources.map(
          ({ sourceUrl, reason }) =>
            `保存しなかった出典: ${sourceUrl}（${reason}）`,
        ),
      ].join("\n") + skippedSummary
    );
  }

  const db = getSupabaseServerClient();
  const { data: match, error: matchError } = await db
    .from("matches")
    .select("kickoff_at")
    .eq("id", submission.matchId)
    .maybeSingle();
  if (matchError) {
    throw matchError;
  }
  if (!match) {
    return "対象の試合が見つかりません。";
  }

  const contentType: ContentType =
    new Date(match.kickoff_at).getTime() > Date.now() ? "preview" : "recap";
  const finalRows = rows.map((row) => ({ ...row, content_type: contentType }));
  let savedRows: Array<{ fact: string }> = [];
  if (finalRows.length > 0) {
    const { data, error: upsertError } = await db
      .from("match_sourced_facts")
      .upsert(finalRows, {
        ignoreDuplicates: true,
        onConflict: "match_id,content_type,fact",
      })
      .select("fact");
    if (upsertError) {
      throw upsertError;
    }
    savedRows = data ?? [];
  }

  const savedCount = savedRows.length;
  const prefixLines = [
    `保存: ${savedCount}件（出典 ${acceptedSourceUrls.size} 本）、重複スキップ: ${finalRows.length - savedCount}件`,
    ...ownerVerifiedSources.map(
      ({ sourceDomain, status }) =>
        `目視確認済みとして保存: ${sourceDomain}（HTTP ${status}）`,
    ),
    ...rejectedSources.map(
      ({ sourceUrl, reason }) =>
        `保存しなかった出典: ${sourceUrl}（${reason}）`,
    ),
  ];
  if (savedCount === 0 && finalRows.length === 0) {
    prefixLines.unshift("保存できる事実がありませんでした。");
  }
  const prefix = `${prefixLines.join("\n")}${skippedSummary}`;
  if (finalRows.length === 0) {
    return prefix;
  }
  try {
    const allowedRows = await loadAllowedSourcedFactRows(
      submission.matchId,
      contentType,
    );
    const selection = selectSourcedFactsForGeneration(allowedRows);
    if (selection.droppedManual.length > 0) {
      console.warn(
        `[sourced-facts] Dropped ${selection.droppedManual.length} manual fact(s) over the generation cap for match_id=${submission.matchId}.`,
      );
    }
    return formatManualFactsGenerationNotice({
      droppedManual: selection.droppedManual,
      manualTotal: selection.manualTotal,
      prefix,
    });
  } catch {
    return `${prefix}\n（件数の確認に失敗しました）`;
  }
}

async function editDeferredInteractionResponse(params: {
  applicationId: string;
  content: string;
  token: string;
}) {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${encodeURIComponent(params.applicationId)}/${encodeURIComponent(params.token)}/messages/@original`,
    {
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        content: params.content,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Discord deferred response update failed with HTTP ${response.status}.`,
    );
  }
}

function deferResearchFactEntry(interaction: DiscordInteraction) {
  if (
    typeof interaction.application_id !== "string" ||
    typeof interaction.token !== "string"
  ) {
    return interactionResponse("入力内容を確認してください。");
  }

  const applicationId = interaction.application_id;
  const token = interaction.token;
  after(async () => {
    let content: string;
    try {
      content = await processResearchFactEntry(interaction);
    } catch (error) {
      console.error(
        "[discord] Failed to save a researched fact entry.",
        error instanceof Error ? error.message : "Unknown error",
      );
      content = "事実の保存中にエラーが発生しました。";
    }

    try {
      await editDeferredInteractionResponse({ applicationId, content, token });
    } catch (error) {
      console.error(
        "[discord] Failed to update a deferred interaction response.",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  });

  return deferredInteractionResponse();
}

export async function POST(request: Request) {
  const body = await request.text();
  const { DISCORD_OWNER_USER_ID, DISCORD_PUBLIC_KEY } = getServerEnv();
  if (
    !verifyDiscordSignature({
      body,
      publicKey: DISCORD_PUBLIC_KEY,
      signature: request.headers.get("x-signature-ed25519"),
      timestamp: request.headers.get("x-signature-timestamp"),
    })
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  if (interaction.type === 1) {
    return Response.json({ type: 1 });
  }

  if (!DISCORD_OWNER_USER_ID) {
    throw new Error("DISCORD_OWNER_USER_ID is not configured.");
  }
  if (getInteractionUserId(interaction) !== DISCORD_OWNER_USER_ID) {
    return new Response("Forbidden", { status: 403 });
  }

  if (interaction.type === 2) {
    if (
      interaction.data?.name === RESEARCH_FACT_ENTRY_COMMAND_NAME &&
      interaction.data.type === 1
    ) {
      return openResearchFactEntryModal(interaction);
    }
    return interactionResponse("未対応のDiscord操作です。");
  }
  if (interaction.type === 5) {
    if (
      typeof interaction.data?.custom_id === "string" &&
      RESEARCH_MODAL_ID_PATTERN.test(interaction.data.custom_id)
    ) {
      return deferResearchFactEntry(interaction);
    }
    return interactionResponse("未対応のDiscord操作です。");
  }

  return interactionResponse("未対応のDiscord操作です。");
}
