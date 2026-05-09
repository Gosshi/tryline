import { NextResponse } from "next/server";
import webpush from "web-push";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

type PushSendBody = {
  awayScore: number;
  awayTeamName: string;
  awayTeamSlug: string;
  homeScore: number;
  homeTeamName: string;
  homeTeamSlug: string;
  matchId: string;
};

function parsePushSendBody(body: unknown): PushSendBody | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const hasValidShape =
    typeof candidate.matchId === "string" &&
    typeof candidate.homeTeamSlug === "string" &&
    typeof candidate.awayTeamSlug === "string" &&
    typeof candidate.homeScore === "number" &&
    typeof candidate.awayScore === "number" &&
    typeof candidate.homeTeamName === "string" &&
    typeof candidate.awayTeamName === "string";

  return hasValidShape ? (candidate as PushSendBody) : null;
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    throw error;
  }

  const { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } = getServerEnv();

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const body = parsePushSendBody(await request.json());

  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = getSupabaseServerClient();
  const { data: subscriptions, error } = await db
    .from("push_subscriptions")
    .select("auth_key, endpoint, p256dh, spoiler_guard, team_slugs");

  if (error) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const matchUrl = `/matches/${body.matchId}`;
  let sent = 0;

  for (const sub of subscriptions ?? []) {
    const teamSlugs = sub.team_slugs ?? [];
    const teamMatch =
      teamSlugs.length === 0 ||
      teamSlugs.includes(body.homeTeamSlug) ||
      teamSlugs.includes(body.awayTeamSlug);

    if (!teamMatch) {
      continue;
    }

    const title = sub.spoiler_guard
      ? "試合終了"
      : `${body.homeTeamName} ${body.homeScore}–${body.awayScore} ${body.awayTeamName}`;
    const payload = JSON.stringify({
      body: "レビューが生成されました",
      title,
      url: matchUrl,
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { auth: sub.auth_key, p256dh: sub.p256dh },
        },
        payload,
      );
      sent += 1;
    } catch {
      // Expired endpoints are ignored in this MVP scope.
    }
  }

  return NextResponse.json({ sent });
}
