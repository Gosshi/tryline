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

type PublishedMatchContentRow = {
  content_type: string;
  content_md_ja: string;
  generated_at: string;
  model_version: string;
  prompt_version: string;
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
