import { NextResponse } from "next/server";

import { POST as ingestLeagueOneLineupsRoute } from "@/app/api/cron/ingest-league-one-lineups/route";
import { POST as ingestLineupsRoute } from "@/app/api/cron/ingest-lineups/route";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { runOrchestrate } from "@/lib/cron/orchestrate";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { generateMatchContent } from "@/lib/llm/pipeline";
import { fetchSourcedFactsForMatch } from "@/lib/llm/sourced-facts/fetch";

import type { PushMatchInfo } from "@/lib/cron/orchestrate";

export const maxDuration = 300;

async function ingestLineups(
  matchId: string,
  competitionFamily?: string | null,
): Promise<"triggered" | "no_url"> {
  const { CRON_SECRET } = getServerEnv();
  const route =
    competitionFamily === "league-one"
      ? ingestLeagueOneLineupsRoute
      : ingestLineupsRoute;
  const pathname =
    competitionFamily === "league-one"
      ? "ingest-league-one-lineups"
      : "ingest-lineups";
  const response = await route(
    new Request(`http://localhost/api/cron/${pathname}?match_id=${matchId}`, {
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

async function sendPushNotification(info: PushMatchInfo): Promise<void> {
  const { CRON_SECRET } = getServerEnv();
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/push/send`, {
    body: JSON.stringify(info),
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`push/send failed: ${response.status}`);
  }
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const result = await runOrchestrate({
      db: getSupabaseServerClient(),
      fetchSourcedFacts: async (matchId, contentType) => {
        await fetchSourcedFactsForMatch({ contentType, matchId });
      },
      generateContent: generateMatchContent,
      ingestLineups,
      sendPushNotification,
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
