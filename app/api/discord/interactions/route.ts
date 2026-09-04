import { after } from "next/server";
import { createPublicKey, verify } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { validateSourceUrl } from "@/lib/discord/source-url";
import { getServerEnv } from "@/lib/env";

import type { SourcedFactConfidence } from "@/lib/llm/sourced-facts/types";
import type { ContentType } from "@/lib/llm/types";

export const runtime = "nodejs";

const DISCORD_PUBLIC_KEY_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex",
);
const EPHEMERAL = 1 << 6;
const FACT_ENTRY_COMMAND_NAME = "事実を追加";
const FACT_ENTRY_MODAL_PREFIX = "fact-entry";
const RESEARCH_FACT_ENTRY_COMMAND_NAME = "調査事実を追加";
const RESEARCH_FACT_ENTRY_MODAL_PREFIX = "research-fact-entry";
const RESEARCH_FACT_MAX_LENGTH = 300;
const MATCH_CANDIDATE_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_MATCH_OPTIONS = 25;
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const MATCH_ID_PATTERN = new RegExp(`^match_id:\\s*(${UUID_PATTERN})\\s*$`, "im");
const MODAL_ID_PATTERN = new RegExp(
  `^${FACT_ENTRY_MODAL_PREFIX}:(${UUID_PATTERN}):(${UUID_PATTERN})$`,
  "i",
);
const RESEARCH_MODAL_ID_PATTERN = new RegExp(
  `^${RESEARCH_FACT_ENTRY_MODAL_PREFIX}$`,
);
const CONFIDENCES = new Set<SourcedFactConfidence>(["high", "medium", "low"]);

type DiscordInteraction = {
  application_id?: unknown;
  data?: {
    components?: unknown;
    custom_id?: unknown;
    name?: unknown;
    resolved?: {
      messages?: Record<string, { content?: unknown }>;
    };
    target_id?: unknown;
    type?: unknown;
  };
  member?: { user?: { id?: unknown } };
  token?: unknown;
  type?: unknown;
  user?: { id?: unknown };
};

type NotificationReference = {
  matchId: string;
  sourceUrl: string;
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

function parseNotificationReference(content: string): NotificationReference | null {
  const matchId = content.match(MATCH_ID_PATTERN)?.[1];
  const sourceUrl = content.match(/https?:\/\/[^\s<>]+/i)?.[0];
  if (!matchId || !sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }

  return { matchId, sourceUrl };
}

function getMessageCommandReference(
  interaction: DiscordInteraction,
): NotificationReference | null {
  if (
    interaction.data?.name !== FACT_ENTRY_COMMAND_NAME ||
    interaction.data.type !== 3 ||
    typeof interaction.data.target_id !== "string"
  ) {
    return null;
  }

  const content = interaction.data.resolved?.messages?.[interaction.data.target_id]
    ?.content;
  return typeof content === "string" ? parseNotificationReference(content) : null;
}

function buildFactEntryModal(matchId: string, newsLinkId: string) {
  return Response.json({
    data: {
      components: [
        {
          component: {
            custom_id: "fact",
            required: true,
            style: 2,
            type: 4,
          },
          label: "事実",
          type: 18,
        },
        {
          component: {
            custom_id: "confidence",
            options: [
              { label: "high", value: "high" },
              { default: true, label: "medium", value: "medium" },
              { label: "low", value: "low" },
            ],
            placeholder: "確度を選択",
            required: false,
            type: 3,
          },
          description: "未選択なら medium",
          label: "確度",
          type: 18,
        },
      ],
      custom_id: `${FACT_ENTRY_MODAL_PREFIX}:${matchId}:${newsLinkId}`,
      title: "事実を追加",
    },
    type: 9,
  });
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
            "1行に1件・300字以内。主語と数字を明示し、意見や推測は書かない。",
          label: "事実",
          type: 18,
        },
        {
          component: {
            custom_id: "source_url",
            required: true,
            style: 1,
            type: 4,
          },
          label: "出典 URL",
          type: 18,
        },
        {
          component: {
            custom_id: "confidence",
            options: [
              { label: "high", value: "high" },
              { default: true, label: "medium", value: "medium" },
              { label: "low", value: "low" },
            ],
            placeholder: "確度を選択",
            required: false,
            type: 3,
          },
          description: "未選択なら medium",
          label: "確度",
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
      if (Array.isArray(record.values) && typeof record.values[0] === "string") {
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

function parseModalSubmission(interaction: DiscordInteraction) {
  if (interaction.type !== 5 || typeof interaction.data?.custom_id !== "string") {
    return null;
  }

  const modalId = interaction.data.custom_id.match(MODAL_ID_PATTERN);
  const fact = findComponentValue(interaction.data.components, "fact")?.trim();
  const confidenceValue = findComponentValue(
    interaction.data.components,
    "confidence",
  );
  const confidence = confidenceValue ?? "medium";

  if (!modalId || !fact || !CONFIDENCES.has(confidence as SourcedFactConfidence)) {
    return null;
  }

  return {
    confidence: confidence as SourcedFactConfidence,
    fact,
    matchId: modalId[1]!,
    newsLinkId: modalId[2]!,
  };
}

function parseResearchFactLines(value: string) {
  const facts: Array<{ fact: string; lineNumber: number }> = [];

  for (const [index, rawLine] of value.split(/\r?\n/u).entries()) {
    const trimmedLine = rawLine.trim();
    if (trimmedLine.startsWith("#")) {
      continue;
    }

    const fact = trimmedLine.replace(/^[-*・]\s*/u, "").trim();
    if (fact) {
      facts.push({ fact, lineNumber: index + 1 });
    }
  }

  return facts;
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
  const sourceUrl = findComponentValue(
    interaction.data.components,
    "source_url",
  )?.trim();
  const confidenceValue = findComponentValue(
    interaction.data.components,
    "confidence",
  );
  const confidence = confidenceValue ?? "medium";

  if (
    !matchId ||
    !factsValue ||
    !sourceUrl ||
    !CONFIDENCES.has(confidence as SourcedFactConfidence)
  ) {
    return null;
  }

  return {
    confidence: confidence as SourcedFactConfidence,
    facts: parseResearchFactLines(factsValue),
    matchId,
    sourceUrl,
  };
}

async function openFactEntryModal(interaction: DiscordInteraction) {
  const reference = getMessageCommandReference(interaction);
  if (!reference) {
    return interactionResponse("この形式のメッセージではありません。");
  }

  const db = getSupabaseServerClient();
  const { data: newsLink, error } = await db
    .from("news_links")
    .select("id")
    .eq("matched_match_id", reference.matchId)
    .eq("source_url", reference.sourceUrl)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!newsLink) {
    return interactionResponse("この形式のメッセージではありません。");
  }

  return buildFactEntryModal(reference.matchId, newsLink.id);
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

async function saveFactEntry(interaction: DiscordInteraction) {
  const submission = parseModalSubmission(interaction);
  if (!submission) {
    return interactionResponse("入力内容を確認してください。");
  }

  const db = getSupabaseServerClient();
  const [{ data: newsLink, error: newsLinkError }, { data: match, error: matchError }] =
    await Promise.all([
      db
        .from("news_links")
        .select("source_url")
        .eq("id", submission.newsLinkId)
        .eq("matched_match_id", submission.matchId)
        .maybeSingle(),
      db
        .from("matches")
        .select("kickoff_at")
        .eq("id", submission.matchId)
        .maybeSingle(),
    ]);
  if (newsLinkError) {
    throw newsLinkError;
  }
  if (matchError) {
    throw matchError;
  }
  if (!newsLink || !match) {
    return interactionResponse("対象の試合または通知が見つかりません。");
  }

  const sourceDomain = new URL(newsLink.source_url).hostname;
  const contentType: ContentType =
    new Date(match.kickoff_at).getTime() > Date.now() ? "preview" : "recap";
  const { error: upsertError } = await db.from("match_sourced_facts").upsert(
    {
      confidence: submission.confidence,
      content_type: contentType,
      fact: submission.fact,
      fact_ja: submission.fact,
      match_id: submission.matchId,
      metadata: { entry_method: "manual" },
      model_version: "manual",
      source_domain: sourceDomain,
      source_url: newsLink.source_url,
    },
    { onConflict: "match_id,content_type,fact" },
  );
  if (upsertError) {
    throw upsertError;
  }

  return interactionResponse("事実を追加しました。");
}

async function processResearchFactEntry(interaction: DiscordInteraction) {
  const submission = parseResearchModalSubmission(interaction);
  if (!submission) {
    return "入力内容を確認してください。";
  }
  if (submission.facts.length === 0) {
    return "有効な事実が1件もありません。1行に1件ずつ入力してください。";
  }

  const overlongFact = submission.facts.find(
    ({ fact }) => [...fact].length > RESEARCH_FACT_MAX_LENGTH,
  );
  if (overlongFact) {
    return `${overlongFact.lineNumber}行目が${RESEARCH_FACT_MAX_LENGTH}文字を超えています。`;
  }

  const urlValidation = await validateSourceUrl(submission.sourceUrl);
  if (!urlValidation.ok) {
    return urlValidation.reason;
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
  const rows = submission.facts.map(({ fact }) => ({
    confidence: submission.confidence,
    content_type: contentType,
    fact,
    fact_ja: fact,
    match_id: submission.matchId,
    metadata: {
      entry_method: "manual",
      entry_path: "discord_research_command",
    },
    model_version: "manual",
    source_domain: urlValidation.sourceDomain,
    source_url: submission.sourceUrl,
  }));
  const { data: savedRows, error: upsertError } = await db
    .from("match_sourced_facts")
    .upsert(rows, {
      ignoreDuplicates: true,
      onConflict: "match_id,content_type,fact",
    })
    .select("fact");
  if (upsertError) {
    throw upsertError;
  }

  const savedCount = savedRows?.length ?? 0;
  return `保存: ${savedCount}件、重複スキップ: ${rows.length - savedCount}件。`;
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
    return openFactEntryModal(interaction);
  }
  if (interaction.type === 5) {
    if (
      typeof interaction.data?.custom_id === "string" &&
      RESEARCH_MODAL_ID_PATTERN.test(interaction.data.custom_id)
    ) {
      return deferResearchFactEntry(interaction);
    }
    return saveFactEntry(interaction);
  }

  return interactionResponse("未対応のDiscord操作です。");
}
