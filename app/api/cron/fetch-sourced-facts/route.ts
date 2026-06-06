import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { fetchSourcedFactsForMatch } from "@/lib/llm/sourced-facts/fetch";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");
    const contentType = searchParams.get("content_type") ?? "preview";
    const force = searchParams.get("force") === "true";

    if (!matchId || !isUuid(matchId)) {
      return NextResponse.json(
        { error: "match_id must be a valid UUID" },
        { status: 400 },
      );
    }

    if (contentType !== "preview" && contentType !== "recap") {
      return NextResponse.json(
        { error: "content_type must be preview or recap" },
        { status: 400 },
      );
    }

    const result = await fetchSourcedFactsForMatch({
      contentType,
      force,
      matchId,
    });

    return NextResponse.json({ result, status: "ok" });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.error("[fetch-sourced-facts] failed", error);

    return NextResponse.json(
      { error: "Failed to fetch sourced facts" },
      { status: 500 },
    );
  }
}
