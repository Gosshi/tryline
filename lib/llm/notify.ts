import type { ContentType } from "@/lib/llm/types";

export async function notifyContentRejected(matchId: string, contentType: ContentType): Promise<void> {
  console.warn("[content-pipeline] rejected content", {
    matchId,
    contentType,
  });
}
