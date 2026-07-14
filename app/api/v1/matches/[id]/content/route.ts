import { apiSuccess, PRIVATE_CACHE_CONTROL } from "@/lib/api/v1/response";
import { getMobileUserProfile } from "@/lib/api/v1/server";
import { getUserFromBearer, getSupabaseBearerClient } from "@/lib/auth/bearer";
import { isProfilePremium } from "@/lib/auth/server";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { splitRecapForPaywall } from "@/lib/match-content/markdown";
import { isSampleMatch } from "@/lib/sample-matches";

import type { V1ContentItem, V1MatchContentData } from "@/lib/api/v1/types";
import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

function mapContent(
  content: PublishedMatchContent | null,
  markdown?: string,
): V1ContentItem | null {
  return content
    ? {
        content_md: markdown ?? content.contentMdJa,
        content_type: content.contentType,
        generated_at: content.generatedAt,
        model_version: content.modelVersion,
        prompt_version: content.promptVersion,
      }
    : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [content, user, sampleMatch] = await Promise.all([
    getPublishedContentForMatch(id),
    getUserFromBearer(request),
    isSampleMatch(id),
  ]);
  const bearerClient = user ? getSupabaseBearerClient(request) : null;
  const profile =
    user && bearerClient
      ? await getMobileUserProfile(bearerClient, user.id)
      : null;
  const premium = isProfilePremium(
    profile ? { premium_until: profile.premiumUntil } : null,
  );
  const recapSplit = content.recap
    ? splitRecapForPaywall(content.recap.contentMdJa)
    : null;
  const canReadFullRecap = premium || sampleMatch;
  const locked = Boolean(
    !canReadFullRecap && recapSplit?.hasLocked && recapSplit.lockedMd,
  );
  const recapMarkdown =
    content.recap && recapSplit && !canReadFullRecap
      ? recapSplit.freeMd
      : content.recap?.contentMdJa;
  const data: V1MatchContentData = {
    isPremium: premium,
    locked,
    preview: mapContent(content.preview),
    recap: mapContent(content.recap, recapMarkdown),
  };

  return apiSuccess(data, PRIVATE_CACHE_CONTROL);
}
