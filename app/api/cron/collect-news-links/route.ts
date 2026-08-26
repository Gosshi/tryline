import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv, hasConfiguredValue } from "@/lib/env";
import {
  fetchNewsLinks,
  formatNewsLinkNotification,
  matchNewsLink,
  translateNewsTitle,
} from "@/lib/news-links";

export const runtime = "nodejs";
export const maxDuration = 300;
const NEWS_LINK_NOTIFICATION_LIMIT = 20;

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    throw error;
  }
  try {
    const db = getSupabaseServerClient();
    const now = new Date();
    const until = new Date(now);
    until.setUTCDate(now.getUTCDate() + 14);
    const { data: matches, error } = await db
      .from("matches")
      .select(
        "id, kickoff_at, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
      )
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", until.toISOString());
    if (error) throw error;
    const candidates = (matches ?? []).map((match) => ({
      id: match.id,
      kickoffAt: match.kickoff_at,
      homeTeamName: Array.isArray(match.home_team)
        ? (match.home_team[0]?.name ?? null)
        : (match.home_team?.name ?? null),
      awayTeamName: Array.isArray(match.away_team)
        ? (match.away_team[0]?.name ?? null)
        : (match.away_team?.name ?? null),
    }));
    const links = await fetchNewsLinks();
    let matched = 0;
    let notified = 0;
    let truncated = false;
    for (const link of links) {
      if (notified >= NEWS_LINK_NOTIFICATION_LIMIT) {
        truncated = true;
        break;
      }
      const match = matchNewsLink(link.title, candidates);
      const { data: saved, error: saveError } = await db
        .from("news_links")
        .upsert(
          {
            source_domain: link.sourceDomain,
            source_url: link.sourceUrl,
            title: link.title,
            published_at: link.publishedAt,
            matched_match_id: match?.id ?? null,
          },
          { onConflict: "source_url", ignoreDuplicates: true },
        )
        .select("id, notified_at")
        .maybeSingle();
      if (saveError) throw saveError;
      if (!match || !saved || saved.notified_at) continue;
      matched += 1;
      let titleJa: string | null = null;
      try {
        titleJa = await translateNewsTitle(link.title);
      } catch (translationError) {
        console.error(
          "[news-links] title translation failed",
          translationError,
        );
      }
      const { DISCORD_WEBHOOK_OPS } = getServerEnv();
      if (DISCORD_WEBHOOK_OPS && hasConfiguredValue(DISCORD_WEBHOOK_OPS)) {
        const response = await fetch(DISCORD_WEBHOOK_OPS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formatNewsLinkNotification({
              match,
              title: titleJa ?? link.title,
              url: link.sourceUrl,
            }),
          }),
        });
        if (!response.ok)
          throw new Error(`Discord notification failed: ${response.status}`);
        const { error: updateError } = await db
          .from("news_links")
          .update({ notified_at: new Date().toISOString(), title_ja: titleJa })
          .eq("id", saved.id);
        if (updateError) throw updateError;
        notified += 1;
      }
    }
    return NextResponse.json({
      fetched: links.length,
      matched,
      notified,
      status: "ok",
      truncated,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
