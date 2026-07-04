import { MODELS } from "@/lib/llm/models";
import { createTextResponse } from "@/lib/llm/openai";
import {
  buildVerifyEntitiesPrompt,
  PROMPT_VERSION,
} from "@/lib/llm/prompts/verify-entities";

import type { AllowedPersonEntity } from "@/lib/content/allowed-entities";
import type { SourcedFactInput } from "@/lib/llm/types";

export type EntityMentionVerification = {
  surface: string;
  matched_entity: string | null;
};

export type EntityVerificationResult = {
  mentions: EntityMentionVerification[];
  ungroundedSurfaces: string[];
};

export type EntityVerificationStageResponse = {
  result: EntityVerificationResult;
  modelVersion: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  attempts: number;
};

type ParsedEntityVerificationResponse = {
  mentions?: unknown;
};

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function parseEntityVerificationResponse(
  jsonText: string,
  allowedEntities: AllowedPersonEntity[],
): EntityVerificationResult {
  const parsed = JSON.parse(jsonText) as ParsedEntityVerificationResponse;
  if (!Array.isArray(parsed.mentions)) {
    throw new Error("entity verification response missing mentions");
  }

  const allowed = new Set(
    allowedEntities.map((entity) => normalizeName(entity.name)),
  );
  const mentions: EntityMentionVerification[] = parsed.mentions.map(
    (mention) => {
      if (!mention || typeof mention !== "object") {
        throw new Error("entity verification mention must be an object");
      }

      const candidate = mention as {
        surface?: unknown;
        matched_entity?: unknown;
      };
      if (typeof candidate.surface !== "string") {
        throw new Error("entity verification mention missing surface");
      }
      if (
        candidate.matched_entity !== null &&
        typeof candidate.matched_entity !== "string"
      ) {
        throw new Error("entity verification mention has invalid match");
      }

      return {
        surface: candidate.surface.trim(),
        matched_entity:
          typeof candidate.matched_entity === "string"
            ? candidate.matched_entity.trim()
            : null,
      };
    },
  );

  const ungroundedSurfaces = mentions
    .filter((mention) => {
      if (!mention.surface) {
        return false;
      }
      if (!mention.matched_entity) {
        return true;
      }

      return !allowed.has(normalizeName(mention.matched_entity));
    })
    .map((mention) => mention.surface);

  return {
    mentions,
    ungroundedSurfaces: [...new Set(ungroundedSurfaces)],
  };
}

export async function verifyNarrativeEntities(options: {
  narrative: string;
  allowedEntities: AllowedPersonEntity[];
  sourcedFacts: SourcedFactInput[];
}): Promise<EntityVerificationStageResponse> {
  const prompt = buildVerifyEntitiesPrompt(options);
  let attempts = 0;

  while (attempts < 2) {
    attempts += 1;

    const response = await createTextResponse({
      model: MODELS.FAST,
      input: prompt,
      temperature: 0,
      jsonMode: true,
    });

    try {
      return {
        result: parseEntityVerificationResponse(
          response.text,
          options.allowedEntities,
        ),
        modelVersion: response.model,
        promptVersion: PROMPT_VERSION,
        usage: response.usage,
        attempts,
      };
    } catch (error) {
      if (attempts >= 2) {
        throw new Error(
          `entity verification failed: ${
            error instanceof Error ? error.message : "invalid response"
          }`,
        );
      }
    }
  }

  throw new Error("entity verification failed: unreachable");
}
