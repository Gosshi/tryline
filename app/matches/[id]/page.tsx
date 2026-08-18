import Link from "next/link";
import { notFound } from "next/navigation";

import { LangToggle } from "@/components/lang-toggle";
import { MatchContentSection } from "@/components/match-content-section";
import { MatchContentTrustStrip } from "@/components/match-content-trust-strip";
import {
  MatchDetailHeader,
  MatchFavoriteTeamControls,
  NextWatchSection,
} from "@/components/match-detail-user-state";
import { MatchEventsSection } from "@/components/match-events-section";
import { MatchLineupsSection } from "@/components/match-lineups-section";
import { PremiumMatchChat } from "@/components/premium-match-chat";
import { PremiumRecapSection } from "@/components/premium-recap-section";
import { SampleRecapCta } from "@/components/sample-recap-cta";
import { StandingsTable } from "@/components/standings-table";
import { UserStateProvider } from "@/components/user-state-provider";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import {
  countHeadToHeadMatches,
  getMatchById,
  getMatchContentEn,
  getNextMatchesForTeams,
  getPoolTeamsForMatch,
  getRelatedPublishedRecapsForMatch,
  listMatchIdsWithContent,
  normalizeHeadToHeadSlug,
} from "@/lib/db/queries/matches";
import { getSourcedFactSummaryForMatch } from "@/lib/db/queries/sourced-facts";
import { getStandingsForCompetition } from "@/lib/db/queries/standings";
import {
  formatCompetitionTitle,
  getCompetitionDisplayName,
} from "@/lib/format/competition";
import { buildMatchEventPlayerLinks } from "@/lib/format/match-event-player-links";
import { formatRoundLabel } from "@/lib/format/round-label";
import {
  extractCoreSection,
  extractDescription,
} from "@/lib/match-content/description";
import { splitRecapForPaywall } from "@/lib/match-content/markdown";
import { isSampleMatch } from "@/lib/sample-matches";
import { createMatchOgImage } from "@/lib/seo/og-image";
import { SITE_URL } from "@/lib/site";

import type { MatchStatus } from "@/lib/format/status";
import type { Metadata } from "next";

type MatchDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const revalidate = 3600;

const THIN_FUTURE_MATCH_NOINDEX_DAYS = 7;

export async function generateStaticParams() {
  const matches = await listMatchIdsWithContent();

  return matches.map(({ id }) => ({ id }));
}

function toEventStatus(status: MatchStatus): string {
  switch (status) {
    case "finished":
      return "https://schema.org/EventCompleted";
    case "postponed":
      return "https://schema.org/EventPostponed";
    case "cancelled":
      return "https://schema.org/EventCancelled";
    default:
      return "https://schema.org/EventScheduled";
  }
}

function shouldNoIndexThinFutureMatch({
  hasContent,
  kickoffAt,
  now = new Date(),
  status,
}: {
  hasContent: boolean;
  kickoffAt: string;
  now?: Date;
  status: MatchStatus;
}): boolean {
  if (hasContent || status !== "scheduled") {
    return false;
  }

  const kickoffTime = new Date(kickoffAt).getTime();
  const thresholdMs = THIN_FUTURE_MATCH_NOINDEX_DAYS * 24 * 60 * 60 * 1000;

  return kickoffTime - now.getTime() >= thresholdMs;
}

export async function generateMetadata({
  params,
}: MatchDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const [match, content] = await Promise.all([
    getMatchById(id),
    getPublishedContentForMatch(id),
  ]);

  if (!match) {
    return {
      title: "Match Not Found",
    };
  }

  const competitionTitle = formatCompetitionTitle(
    getCompetitionDisplayName(match.competition),
    match.competition.season,
  );
  const matchupTitle = `${match.homeTeam.name} 対 ${match.awayTeam.name}`;
  const title = `${matchupTitle} — ${competitionTitle}`;
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const isScheduledPoolMatch =
    match.status === "scheduled" &&
    match.competition.family === "rwc" &&
    match.poolName !== null;
  const poolTeams = isScheduledPoolMatch
    ? await getPoolTeamsForMatch(match.competition.slug, match.poolName!)
    : [];
  const poolContextTitle =
    isScheduledPoolMatch && match.poolName
      ? `${match.competition.name} ${match.poolName}`
      : null;
  const description =
    match.status === "finished" && content.recap
      ? extractCoreSection(content.recap.contentMdJa)
      : match.status === "finished" && hasScore
        ? `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}（${competitionTitle}）の試合結果・日本語レビュー。`
        : content.preview
          ? extractDescription(content.preview.contentMdJa)
          : isScheduledPoolMatch && poolTeams.length > 0
            ? `${matchupTitle}（${poolContextTitle}）の試合情報。同プール: ${poolTeams.map((team) => team.name).join("、")}。`
            : `${matchupTitle} の試合情報。${competitionTitle}。`;
  const score =
    match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore}–${match.awayScore}`
      : undefined;
  const shouldNoIndex = shouldNoIndexThinFutureMatch({
    hasContent: content.preview !== null || content.recap !== null,
    kickoffAt: match.kickoffAt,
    status: match.status,
  });

  return {
    alternates: { canonical: `${SITE_URL}/matches/${id}` },
    description,
    openGraph: {
      description,
      images: [
        createMatchOgImage({
          away: match.awayTeam.name,
          competition: competitionTitle,
          home: match.homeTeam.name,
          score,
          status: match.status === "in_progress" ? "live" : match.status,
        }),
      ],
      title: `${title} | Tryline`,
      type: "article",
      url: `${SITE_URL}/matches/${id}`,
    },
    ...(shouldNoIndex
      ? { robots: { follow: true, index: false } }
      : {}),
    title,
  };
}

export default async function MatchDetailPage({
  params,
}: MatchDetailPageProps) {
  const { id } = await params;
  const [match, publishedContent, events, lineups, sourcedFactSummary] =
    await Promise.all([
      getMatchById(id),
      getPublishedContentForMatch(id),
      getMatchEventsForMatch(id),
      getMatchLineupsForMatch(id),
      getSourcedFactSummaryForMatch(id),
    ]);

  if (!match) {
    notFound();
  }

  const [
    headToHeadCount,
    englishContent,
    standings,
    nextMatches,
    relatedRecaps,
  ] = await Promise.all([
    countHeadToHeadMatches(match.homeTeam.slug, match.awayTeam.slug),
    getMatchContentEn(id),
    getStandingsForCompetition(match.competition.slug),
    getNextMatchesForTeams({
      afterIso: match.kickoffAt,
      excludeMatchId: id,
      teamIds: [match.homeTeamId, match.awayTeamId],
    }),
    getRelatedPublishedRecapsForMatch({
      competitionSlug: match.competition.slug,
      excludeMatchId: id,
      round: match.round,
    }),
  ]);
  const isScheduledPoolMatch =
    match.status === "scheduled" &&
    match.competition.family === "rwc" &&
    match.poolName !== null;
  const poolTeams = isScheduledPoolMatch
    ? await getPoolTeamsForMatch(match.competition.slug, match.poolName!)
    : [];
  const poolContextTitle =
    isScheduledPoolMatch && match.poolName
      ? `${match.competition.name} ${match.poolName}`
      : null;
  const headToHeadHref =
    headToHeadCount >= 2
      ? `/h2h/${normalizeHeadToHeadSlug(
          match.homeTeam.slug,
          match.awayTeam.slug,
        )}`
      : null;
  const hasEnglishContent =
    englishContent.preview !== null || englishContent.recap !== null;
  const hasConfirmedLineups = lineups.length > 0;
  const eventPlayerLinks = buildMatchEventPlayerLinks(events, lineups);
  const isFreeSampleRecap =
    (await isSampleMatch(id)) && publishedContent.recap !== null;
  const recapSplit = publishedContent.recap
    ? splitRecapForPaywall(publishedContent.recap.contentMdJa)
    : null;
  const freeRecapContent =
    publishedContent.recap && recapSplit
      ? { ...publishedContent.recap, contentMdJa: recapSplit.freeMd }
      : publishedContent.recap;
  const competitionTitle = formatCompetitionTitle(
    match.competition,
    match.competition.season,
  );
  const matchupTitle = `${match.homeTeam.name} 対 ${match.awayTeam.name}`;
  const pageUrl = `${SITE_URL}/matches/${id}`;
  const score =
    match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore}–${match.awayScore}`
      : undefined;
  const description =
    match.status === "finished" && publishedContent.recap
      ? extractCoreSection(publishedContent.recap.contentMdJa)
      : match.status === "finished" &&
          match.homeScore !== null &&
          match.awayScore !== null
        ? `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}（${competitionTitle}）の試合結果・日本語レビュー。`
        : publishedContent.preview
          ? extractDescription(publishedContent.preview.contentMdJa)
          : isScheduledPoolMatch && poolTeams.length > 0
            ? `${matchupTitle}（${poolContextTitle}）の試合情報。同プール: ${poolTeams.map((team) => team.name).join("、")}。`
            : `${matchupTitle} の試合情報。${competitionTitle}。`;
  const ogImageUrl = createMatchOgImage({
    away: match.awayTeam.name,
    competition: competitionTitle,
    home: match.homeTeam.name,
    score,
    status: match.status === "in_progress" ? "live" : match.status,
  }).url;
  const sportsEventJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    awayTeam: {
      "@type": "SportsTeam",
      name: match.awayTeam.name,
    },
    homeTeam: {
      "@type": "SportsTeam",
      name: match.homeTeam.name,
    },
    eventStatus: toEventStatus(match.status),
    name: matchupTitle,
    sport: "Rugby Union",
    startDate: match.kickoffAt,
    ...(match.venue
      ? {
          location: {
            "@type": "Place",
            name: match.venue,
          },
        }
      : {}),
    ...(match.status === "finished"
      ? {
          awayTeam: {
            "@type": "SportsTeam",
            name: match.awayTeam.name,
            score: match.awayScore ?? 0,
          },
          homeTeam: {
            "@type": "SportsTeam",
            name: match.homeTeam.name,
            score: match.homeScore ?? 0,
          },
        }
      : {}),
  };
  const newsArticleJsonLd = publishedContent.recap
    ? {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        author: { "@type": "Organization", name: "Tryline" },
        dateModified: publishedContent.recap.generatedAt,
        datePublished: publishedContent.recap.generatedAt,
        description,
        headline: `${matchupTitle} — ${competitionTitle}`,
        image: ogImageUrl.startsWith("http")
          ? ogImageUrl
          : `${SITE_URL}${ogImageUrl}`,
        publisher: {
          "@type": "Organization",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/og-image.png`,
          },
          name: "Tryline",
        },
        url: pageUrl,
      }
    : null;
  const jsonLd = newsArticleJsonLd
    ? [sportsEventJsonLd, newsArticleJsonLd]
    : sportsEventJsonLd;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <UserStateProvider>
      <main className="min-h-screen bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 overflow-hidden px-3 py-6 sm:px-6 sm:py-8 md:px-8">
          <nav aria-label="パンくずリスト">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-ink-muted)]">
              <li>
                <Link
                  className="transition-colors hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  href={`/c/${match.competition.family}/${match.competition.season}`}
                >
                  {formatCompetitionTitle(
                    match.competition,
                    match.competition.season,
                  )}
                </Link>
              </li>
              {match.round !== null && (
                <>
                  <li aria-hidden className="select-none">
                    /
                  </li>
                  <li className="text-[var(--color-ink)]">
                    {formatRoundLabel(match.round, match.competition.family)}
                  </li>
                </>
              )}
            </ol>
          </nav>

          <MatchDetailHeader
            headToHeadHref={headToHeadHref}
            match={match}
          />

          <MatchFavoriteTeamControls
            teams={[
              {
                id: match.homeTeamId,
                name: match.homeTeam.name,
                slug: match.homeTeam.slug,
                source: "match_detail_home_team",
              },
              {
                id: match.awayTeamId,
                name: match.awayTeam.name,
                slug: match.awayTeam.slug,
                source: "match_detail_away_team",
              },
            ]}
          />

          {hasEnglishContent && (
            <div className="flex items-center justify-end">
              <LangToggle currentLang="ja" matchId={match.id} />
            </div>
          )}

          <section className="space-y-4">
            {match.status !== "finished" && (
              <MatchContentSection
                afterBody={
                  publishedContent.preview ? (
                    <MatchContentTrustStrip
                      hasConfirmedLineups={hasConfirmedLineups}
                      sourcedFactSources={sourcedFactSummary.previewSources}
                    />
                  ) : null
                }
                content={publishedContent.preview}
                contentType="preview"
                isPremium={true}
                match={match}
                showCta={false}
              />
            )}
            {isScheduledPoolMatch && poolTeams.length > 0 && (
              <section
                aria-labelledby="pool-info-heading"
                className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)]"
              >
                <h2
                  className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]"
                  id="pool-info-heading"
                >
                  {match.poolName} 参加チーム
                </h2>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {poolTeams.map((team) => (
                    <li key={team.slug}>
                      <Link
                        className="block rounded-lg border border-[var(--color-border)] px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                        href={`/teams/${team.slug}`}
                      >
                        {team.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {isFreeSampleRecap ? (
              <>
                <MatchContentSection
                  afterBody={
                    <>
                      <MatchContentTrustStrip
                        hasConfirmedLineups={hasConfirmedLineups}
                        sourcedFactSources={sourcedFactSummary.recapSources}
                      />
                      <MatchEventsSection
                        awayTeamName={match.awayTeam.name}
                        awayTeamSlug={match.awayTeam.slug}
                        events={events}
                        finalAwayScore={match.awayScore ?? 0}
                        finalHomeScore={match.homeScore ?? 0}
                        homeTeamId={match.homeTeamId}
                        homeTeamName={match.homeTeam.name}
                        homeTeamSlug={match.homeTeam.slug}
                        playerLinks={eventPlayerLinks}
                        variant="timeline"
                      />
                    </>
                  }
                  betweenLeadAndBody={
                    <MatchEventsSection
                      awayTeamName={match.awayTeam.name}
                      awayTeamSlug={match.awayTeam.slug}
                      events={events}
                      finalAwayScore={match.awayScore ?? 0}
                      finalHomeScore={match.homeScore ?? 0}
                      homeTeamId={match.homeTeamId}
                      homeTeamName={match.homeTeam.name}
                      homeTeamSlug={match.homeTeam.slug}
                      playerLinks={eventPlayerLinks}
                    />
                  }
                  content={publishedContent.recap}
                  contentType="recap"
                  isPremium={true}
                  match={match}
                />
                <SampleRecapCta matchId={id} />
              </>
            ) : (
              <PremiumRecapSection
                afterBody={
                  publishedContent.recap ? (
                    <>
                      <MatchContentTrustStrip
                        hasConfirmedLineups={hasConfirmedLineups}
                        sourcedFactSources={sourcedFactSummary.recapSources}
                      />
                      <MatchEventsSection
                        awayTeamName={match.awayTeam.name}
                        awayTeamSlug={match.awayTeam.slug}
                        events={events}
                        finalAwayScore={match.awayScore ?? 0}
                        finalHomeScore={match.homeScore ?? 0}
                        homeTeamId={match.homeTeamId}
                        homeTeamName={match.homeTeam.name}
                        homeTeamSlug={match.homeTeam.slug}
                        playerLinks={eventPlayerLinks}
                        variant="timeline"
                      />
                    </>
                  ) : null
                }
                betweenLeadAndBody={
                  publishedContent.recap ? (
                    <MatchEventsSection
                      awayTeamName={match.awayTeam.name}
                      awayTeamSlug={match.awayTeam.slug}
                      events={events}
                      finalAwayScore={match.awayScore ?? 0}
                      finalHomeScore={match.homeScore ?? 0}
                      homeTeamId={match.homeTeamId}
                      homeTeamName={match.homeTeam.name}
                      homeTeamSlug={match.homeTeam.slug}
                      playerLinks={eventPlayerLinks}
                    />
                  ) : null
                }
                content={freeRecapContent}
                hasLockedContent={recapSplit?.hasLocked ?? false}
                match={match}
                nextLockedHeading={recapSplit?.nextHeadingText ?? null}
              />
            )}
            {match.status === "finished" && publishedContent.preview && (
              <details className="group rounded-[var(--radius-md)] bg-white shadow-[var(--shadow-soft)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-[var(--color-ink)] marker:content-none sm:px-7">
                  試合前のプレビューを表示
                  <span
                    aria-hidden
                    className="text-lg text-[var(--color-ink-muted)] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="space-y-4 border-t border-[var(--color-rule)] bg-[var(--color-paper)] p-3 sm:p-4">
                  <MatchContentSection
                    afterBody={
                      <MatchContentTrustStrip
                        hasConfirmedLineups={hasConfirmedLineups}
                        sourcedFactSources={sourcedFactSummary.previewSources}
                      />
                    }
                    content={publishedContent.preview}
                    contentType="preview"
                    isPremium
                    match={match}
                    showCta={false}
                  />
                </div>
              </details>
            )}
          </section>

          <NextWatchSection
            nextMatches={nextMatches}
            relatedRecaps={relatedRecaps}
            teams={[
              {
                id: match.homeTeamId,
                name: match.homeTeam.name,
                slug: match.homeTeam.slug,
              },
              {
                id: match.awayTeamId,
                name: match.awayTeam.name,
                slug: match.awayTeam.slug,
              },
            ]}
          />

          <MatchLineupsSection
            awayTeamName={match.awayTeam.name}
            homeTeamId={match.homeTeamId}
            homeTeamName={match.homeTeam.name}
            players={lineups}
          />

          <StandingsTable
            highlightedTeams={[
              match.homeTeam.name,
              match.homeTeam.shortCode,
              match.awayTeam.name,
              match.awayTeam.shortCode,
            ]}
            standings={standings}
            title="順位への影響"
          />

          <PremiumMatchChat matchId={id} />
        </div>
      </main>
      </UserStateProvider>
    </>
  );
}
