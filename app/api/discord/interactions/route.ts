import { createPublicKey, verify } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
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
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const MATCH_ID_PATTERN = new RegExp(`^match_id:\\s*(${UUID_PATTERN})\\s*$`, "im");
const MODAL_ID_PATTERN = new RegExp(
  `^${FACT_ENTRY_MODAL_PREFIX}:(${UUID_PATTERN}):(${UUID_PATTERN})$`,
  "i",
);
const CONFIDENCES = new Set<SourcedFactConfidence>(["high", "medium", "low"]);

type DiscordInteraction = {
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
  type?: unknown;
  user?: { id?: unknown };
};

type NotificationReference = {
  matchId: string;
  sourceUrl: string;
};

function interactionResponse(content: string) {
  return Response.json({
    data: { content, flags: EPHEMERAL },
    type: 4,
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
            style: 2,
            type: 4,
          },
          label: "事実",
          required: true,
          type: 18,
        },
        {
          component: {
            custom_id: "confidence",
            max_values: 1,
            min_values: 0,
            options: [
              { label: "high", value: "high" },
              { default: true, label: "medium", value: "medium" },
              { label: "low", value: "low" },
            ],
            placeholder: "確度（既定: medium）",
            type: 3,
          },
          description: "既定: medium",
          label: "確度",
          required: false,
          type: 18,
        },
      ],
      custom_id: `${FACT_ENTRY_MODAL_PREFIX}:${matchId}:${newsLinkId}`,
      title: "事実を追加",
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
    return openFactEntryModal(interaction);
  }
  if (interaction.type === 5) {
    return saveFactEntry(interaction);
  }

  return interactionResponse("未対応のDiscord操作です。");
}
