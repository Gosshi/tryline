import Link from "next/link";

import { WeekSchedule } from "@/components/calendar/week-schedule";
import { IosAppCta } from "@/components/ios-app-cta";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { TrackedLink } from "@/components/tracked-link";
import { getUser } from "@/lib/auth/server";
import { getMatchesInRange } from "@/lib/db/queries/matches";
import { getSpoilerGuardEnabledForUser } from "@/lib/db/queries/spoiler-guard";
import { getStandingPositionLookupForCompetitions } from "@/lib/db/queries/standings";
import { selectCalendarFocusMatchId } from "@/lib/format/calendar-focus";
import { formatCompetitionTitle } from "@/lib/format/competition";
import {
  addJstDays,
  formatJstWeekRangeLabel,
  getCurrentJstWeekRangeUtc,
  getJstWeekRangeUtc,
} from "@/lib/format/week";
import { createCalendarOgImage } from "@/lib/seo/og-image";
import { SITE_URL } from "@/lib/site";

import type { CalendarMatch } from "@/lib/db/queries/matches";
import type { Metadata } from "next";

export const revalidate = 1800;

const CALENDAR_TITLE = "今週の試合カレンダー｜海外ラグビー 日本時間";

type CalendarSearchParams = {
  week?: string | string[];
};

type CalendarPageProps = {
  searchParams?: Promise<CalendarSearchParams>;
};

async function resolveSearchParams(
  searchParams?: CalendarPageProps["searchParams"],
): Promise<CalendarSearchParams> {
  return searchParams ? await searchParams : {};
}

function getWeekParam(searchParams: CalendarSearchParams): string | null {
  const week = searchParams.week;

  if (Array.isArray(week)) {
    return week[0] ?? null;
  }

  return week ?? null;
}

function getCalendarHref(weekStartJst: string): string {
  const currentWeek = getCurrentJstWeekRangeUtc().weekStartJst;

  return weekStartJst === currentWeek
    ? "/calendar"
    : "/calendar?week=" + weekStartJst;
}

function getWebcalUrl(url: string): string {
  return url.replace(/^https?:/, "webcal:");
}

export async function generateMetadata({
  searchParams,
}: CalendarPageProps): Promise<Metadata> {
  const params = await resolveSearchParams(searchParams);
  const weekParam = getWeekParam(params);
  const hasWeekParam = Boolean(weekParam);
  const range = weekParam
    ? getJstWeekRangeUtc(weekParam)
    : getCurrentJstWeekRangeUtc();
  const matches = await getMatchesInRange(range.startUtcIso, range.endUtcIso);
  const competitionIds = matches
    .map((match) => match.competition.id ?? match.competition.slug)
    .filter(Boolean);
  const standingPositions =
    await getStandingPositionLookupForCompetitions(competitionIds);
  const focusMatchId = selectCalendarFocusMatchId(matches, standingPositions);
  const focusMatch =
    focusMatchId !== null
      ? matches.find((match) => match.id === focusMatchId)
      : undefined;
  const competitionCount = new Set(competitionIds).size;

  return {
    alternates: { canonical: SITE_URL + "/calendar" },
    description:
      "今週開催される海外ラグビーの試合を全大会横断で確認できます。JSTの曜日別にキックオフ時刻、状態、日本語レビュー・プレビューの有無をまとめています。",
    openGraph: {
      description:
        "今週開催される海外ラグビーの試合を全大会横断で確認できます。JSTの曜日別にキックオフ時刻、状態、日本語レビュー・プレビューの有無をまとめています。",
      images: [
        createCalendarOgImage({
          competitionCount,
          focusAway: focusMatch?.awayTeam.name,
          focusCompetition: focusMatch
            ? formatCompetitionTitle(
                focusMatch.competition,
                focusMatch.competition.season,
              )
            : undefined,
          focusHome: focusMatch?.homeTeam.name,
          focusKickoffAt: focusMatch?.kickoffAt,
          matchCount: matches.length,
          weekLabel: formatJstWeekRangeLabel(range.weekStartJst),
        }),
      ],
      title: `${CALENDAR_TITLE} | Tryline`,
      type: "website",
      url: `${SITE_URL}/calendar`,
    },
    robots: hasWeekParam ? { follow: true, index: false } : undefined,
    title: CALENDAR_TITLE,
  };
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const params = await resolveSearchParams(searchParams);
  const weekParam = getWeekParam(params);
  const range = weekParam
    ? getJstWeekRangeUtc(weekParam)
    : getCurrentJstWeekRangeUtc();
  const user = await getUser();
  const [matches, spoilerGuardEnabled] = await Promise.all([
    getMatchesInRange(range.startUtcIso, range.endUtcIso),
    getSpoilerGuardEnabledForUser(user?.id),
  ]);
  const competitionIds = matches
    .map((match) => match.competition.id)
    .filter((id): id is string => Boolean(id));
  const standingPositions =
    await getStandingPositionLookupForCompetitions(competitionIds);
  const focusMatchId = selectCalendarFocusMatchId(matches, standingPositions);
  const competitionsInWeek = Array.from(
    matches.reduce((competitions, match) => {
      const key = `${match.competition.family}:${match.competition.season}`;
      if (!competitions.has(key)) {
        competitions.set(key, match.competition);
      }

      return competitions;
    }, new Map<string, CalendarMatch["competition"]>()),
  ).map(([, competition]) => competition);
  const previousWeek = addJstDays(range.weekStartJst, -7);
  const nextWeek = addJstDays(range.weekStartJst, 7);
  const allCalendarFeedUrl = `${SITE_URL}/api/calendar/all.ics`;

  return (
    <main className="bg-paper min-h-screen">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-8">
          <nav className="mb-4 text-xs text-[var(--color-ink-muted)]">
            <Link className="hover:text-[var(--color-ink)]" href="/">
              ホーム
            </Link>
            <span className="mx-2">/</span>
            <span>今週の試合</span>
          </nav>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Weekly Match Calendar
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            今週の試合カレンダー
          </h1>
          <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
            {formatJstWeekRangeLabel(range.weekStartJst)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="週を移動">
            <Link
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              href={getCalendarHref(previousWeek)}
            >
              前週
            </Link>
            <Link
              className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-accent)]"
              href="/calendar"
            >
              今週
            </Link>
            <Link
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              href={getCalendarHref(nextWeek)}
            >
              翌週
            </Link>
          </div>
          {competitionsInWeek.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                大会別に見る
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {competitionsInWeek.map((competition) => (
                  <TrackedLink
                    analytics={{
                      cta_id: "calendar_competition_list",
                      cta_location: "calendar_header",
                      destination: "competition_hub",
                      label: formatCompetitionTitle(
                        competition,
                        competition.season,
                      ),
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    href={`/c/${competition.family}/${competition.season}`}
                    key={`${competition.family}:${competition.season}`}
                  >
                    {formatCompetitionTitle(competition, competition.season)}
                  </TrackedLink>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8">
        <WeekSchedule
          emptyMessage="この週に表示できる試合はありません。大会ページから過去シーズンの試合を確認できます。"
          highlightMatchId={focusMatchId}
          matches={matches}
          spoilerGuardEnabled={spoilerGuardEnabled}
        />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 md:px-8">
        <p className="max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">
          月曜 00:00 JST から翌月曜 00:00 JST
          までの試合を、全大会横断で曜日ごとにまとめています。レビュー・プレビューが公開済みの試合にはバッジが付きます。
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="border-l-4 border-[var(--color-accent)] bg-slate-50 px-4 py-4">
            <p className="text-sm font-bold text-[var(--color-ink)]">
              カレンダー購読
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-ink)]"
                href={getWebcalUrl(allCalendarFeedUrl)}
              >
                全大会を購読
              </Link>
              <Link
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                href={allCalendarFeedUrl}
              >
                iCal URL
              </Link>
            </div>
          </div>
          <NewsletterSignup source="calendar" />
          <IosAppCta surface="calendar" />
        </div>
      </section>
    </main>
  );
}
