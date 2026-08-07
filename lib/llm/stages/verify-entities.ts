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

function normalizeForFactMatch(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function factSupportsMatchedEntity(
  matchedEntity: string,
  sourcedFacts: SourcedFactInput[],
) {
  const normalizedEntity = normalizeForFactMatch(matchedEntity);
  const minLength = /[^\x00-\x7F]/.test(normalizedEntity) ? 3 : 4;

  if (normalizedEntity.length < minLength) {
    return false;
  }

  const normalizedFacts = sourcedFacts
    .map((fact) => fact.fact)
    .join(" ")
    .toLocaleLowerCase()
    .replace(/\s+/g, "");

  return normalizedFacts.includes(normalizedEntity);
}

function parseEntityVerificationResponse(
  jsonText: string,
  allowedEntities: AllowedPersonEntity[],
  sourcedFacts: SourcedFactInput[],
  knownNonPersonNames: string[] = [],
): EntityVerificationResult {
  const parsed = JSON.parse(jsonText) as ParsedEntityVerificationResponse;
  if (!Array.isArray(parsed.mentions)) {
    throw new Error("entity verification response missing mentions");
  }

  const allowed = new Set(
    allowedEntities.map((entity) => normalizeName(entity.name)),
  );
  const knownNonPersons = new Set(
    knownNonPersonNames.map((name) => normalizeName(name)),
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
      if (knownNonPersons.has(normalizeName(mention.surface))) {
        return false;
      }
      if (!mention.matched_entity) {
        return true;
      }

      const normalizedMatchedEntity = normalizeName(mention.matched_entity);

      if (knownNonPersons.has(normalizedMatchedEntity)) {
        return false;
      }

      return (
        !allowed.has(normalizedMatchedEntity) &&
        !factSupportsMatchedEntity(mention.matched_entity, sourcedFacts)
      );
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
  knownNonPersonNames?: string[];
  sourcedFacts: SourcedFactInput[];
}): Promise<EntityVerificationStageResponse> {
  const prompt = buildVerifyEntitiesPrompt(options);
  let attempts = 0;

  while (attempts < 2) {
    attempts += 1;

    const response = await createTextResponse({
      model: MODELS.FAST,
      input: prompt,
      jsonMode: true,
    });

    try {
      return {
        result: parseEntityVerificationResponse(
          response.text,
          options.allowedEntities,
          options.sourcedFacts,
          options.knownNonPersonNames,
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
