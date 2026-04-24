import { NextResponse } from "next/server";

import { POST as ingestLineupsRoute } from "@/app/api/cron/ingest-lineups/route";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { runOrchestrate } from "@/lib/cron/orchestrate";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { generateMatchContent } from "@/lib/llm/pipeline";

async function ingestLineups(matchId: string): Promise<"triggered" | "no_url"> {
  const { CRON_SECRET } = getServerEnv();
  const response = await ingestLineupsRoute(
    new Request(`http://localhost/api/cron/ingest-lineups?match_id=${matchId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    }),
  );

  if (response.ok) {
    return "triggered";
  }

  if (response.status === 400) {
    const body = await response.json();

    if (body?.error === "matches.external_ids.wikipedia_url is not set") {
      return "no_url";
    }
  }

  throw new Error(`ingest-lineups failed with status ${response.status}`);
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const result = await runOrchestrate({
      db: getSupabaseServerClient(),
      generateContent: generateMatchContent,
      ingestLineups,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.error("[orchestrate] failed", error);

    return NextResponse.json(
      {
        previews: { triggered: 0, skipped: 0 },
        lineups: { triggered: 0, no_url: 0 },
        recaps: { triggered: 0, skipped: 0 },
      },
      { status: 200 },
    );
  }
}
