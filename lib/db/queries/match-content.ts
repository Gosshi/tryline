import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type PublishedMatchContent = {
  contentType: "preview" | "recap";
  contentMdJa: string;
  generatedAt: string;
  modelVersion: string;
  promptVersion: string;
};

export type PublishedMatchContentBundle = {
  preview: PublishedMatchContent | null;
  recap: PublishedMatchContent | null;
};

export type MatchContentStatus = {
  hasPreview: boolean;
  hasRecap: boolean;
};

type PublishedMatchContentRow = {
  content_type: string;
  content_md_ja: string;
  generated_at: string;
  model_version: string;
  prompt_version: string;
};

type MatchContentStatusRow = {
  match_id: string;
  content_type: string;
};

function mapRow(row: PublishedMatchContentRow): PublishedMatchContent {
  if (row.content_type !== "preview" && row.content_type !== "recap") {
    throw new Error(`Unsupported content_type: ${row.content_type}`);
  }

  return {
    contentMdJa: row.content_md_ja,
    contentType: row.content_type,
    generatedAt: row.generated_at,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
  };
}

export async function getPublishedContentForMatch(
  matchId: string,
): Promise<PublishedMatchContentBundle> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      "content_type, content_md_ja, generated_at, model_version, prompt_version",
    )
    .eq("match_id", matchId)
    .eq("status", "published")
    .eq("language", "ja")
    .in("content_type", ["preview", "recap"]);

  if (error) {
    throw error;
  }

  const bundle: PublishedMatchContentBundle = {
    preview: null,
    recap: null,
  };

  for (const row of data satisfies PublishedMatchContentRow[]) {
    const mapped = mapRow(row);
    bundle[mapped.contentType] = mapped;
  }

  return bundle;
}

export async function getContentStatusMap(
  matchIds: string[],
): Promise<Map<string, MatchContentStatus>> {
  if (matchIds.length === 0) {
    return new Map();
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select("match_id, content_type")
    .in("match_id", matchIds)
    .eq("status", "published")
    .eq("language", "ja")
    .in("content_type", ["preview", "recap"]);

  if (error) {
    throw error;
  }

  const map = new Map<string, MatchContentStatus>();

  for (const row of data satisfies MatchContentStatusRow[]) {
    const current = map.get(row.match_id) ?? {
      hasPreview: false,
      hasRecap: false,
    };

    if (row.content_type === "preview") {
      current.hasPreview = true;
    }

    if (row.content_type === "recap") {
      current.hasRecap = true;
    }

    map.set(row.match_id, current);
  }

  return map;
}
