import { NextResponse } from "next/server";

import { buildMatchCalendarIcs } from "@/lib/calendar/ical";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { getMatchesInRange } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";

const FEED_WINDOW_DAYS = 370;
const DAY_MS = 24 * 60 * 60 * 1000;

type RouteContext = {
  params: Promise<{ feed: string }>;
};

function parseFeedParam(feed: string): string | null {
  if (!feed.endsWith(".ics")) {
    return null;
  }

  const slug = feed.slice(0, -".ics".length);

  return slug.length > 0 ? slug : null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { feed } = await params;
  const slug = parseFeedParam(feed);

  if (!slug) {
    return NextResponse.json(
      { error: "invalid_calendar_feed" },
      { status: 404 },
    );
  }

  const start = new Date();
  const end = new Date(start.getTime() + FEED_WINDOW_DAYS * DAY_MS);
  const matches = await getMatchesInRange(start.toISOString(), end.toISOString());

  if (slug === "all") {
    const ics = buildMatchCalendarIcs(
      matches.filter((match) => match.status !== "finished"),
      { title: "Tryline 全大会 試合予定" },
    );

    return new Response(ics, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        "Content-Disposition": 'inline; filename="tryline-all.ics"',
        "Content-Type": "text/calendar; charset=utf-8",
      },
    });
  }

  const competition = await getCompetitionBySlug(slug);

  if (!competition) {
    return NextResponse.json(
      { error: "competition_not_found" },
      { status: 404 },
    );
  }

  const competitionMatches = matches.filter(
    (match) =>
      match.status !== "finished" && match.competition.slug === competition.slug,
  );
  const ics = buildMatchCalendarIcs(competitionMatches, {
    title: formatCompetitionTitle(competition, competition.season),
  });

  return new Response(ics, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      "Content-Disposition": `inline; filename="tryline-${competition.slug}.ics"`,
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}
