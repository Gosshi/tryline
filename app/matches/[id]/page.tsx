import Link from "next/link";
import { notFound } from "next/navigation";

import { LangToggle } from "@/components/lang-toggle";
import { MatchContentSection } from "@/components/match-content-section";
import { MatchEventsSection } from "@/components/match-events-section";
import { MatchHeader } from "@/components/match-header";
import { MatchLineupsSection } from "@/components/match-lineups-section";
import { PremiumMatchChat } from "@/components/premium-match-chat";
import { PremiumRecapSection } from "@/components/premium-recap-section";
import { SampleRecapCta } from "@/components/sample-recap-cta";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import {
  countHeadToHeadMatches,
  getMatchById,
  getMatchContentEn,
  listMatchIdsWithContent,
  normalizeHeadToHeadSlug,
} from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatRoundLabel } from "@/lib/format/round-label";
import {
  extractCoreSection,
  extractDescription,
} from "@/lib/match-content/description";
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
    match.competition.name,
    match.competition.season,
  );
  const title = `${match.homeTeam.name} vs ${match.awayTeam.name} — ${competitionTitle}`;
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const description =
    match.status === "finished" && content.recap
      ? extractCoreSection(content.recap.contentMdJa)
      : match.status === "finished" && hasScore
        ? `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}（${competitionTitle}）の試合結果・日本語レビュー。`
        : content.preview
          ? extractDescription(content.preview.contentMdJa)
          : `${match.homeTeam.name} vs ${match.awayTeam.name} の試合結果・日本語レビュー。`;
  const score =
    match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore}–${match.awayScore}`
      : undefined;

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
    title,
  };
}

export default async function MatchDetailPage({
  params,
}: MatchDetailPageProps) {
  const { id } = await params;
  const [match, publishedContent, events, lineups] = await Promise.all([
    getMatchById(id),
    getPublishedContentForMatch(id),
    getMatchEventsForMatch(id),
    getMatchLineupsForMatch(id),
  ]);

  if (!match) {
    notFound();
  }

  const headToHeadCount = await countHeadToHeadMatches(
    match.homeTeam.slug,
    match.awayTeam.slug,
  );
  const headToHeadHref =
    headToHeadCount >= 2
      ? `/h2h/${normalizeHeadToHeadSlug(
          match.homeTeam.slug,
          match.awayTeam.slug,
        )}`
      : null;
  const shouldShowPreviewSection =
    match.status !== "finished" || publishedContent.preview !== null;
  const englishContent = await getMatchContentEn(id);
  const hasEnglishContent =
    englishContent.preview !== null || englishContent.recap !== null;
  const isFreeSampleRecap =
    isSampleMatch(id) && publishedContent.recap !== null;
  const competitionTitle = formatCompetitionTitle(
    match.competition.name,
    match.competition.season,
  );
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
          : `${match.homeTeam.name} vs ${match.awayTeam.name} の試合結果・日本語レビュー。`;
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
    name: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
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
        headline: `${match.homeTeam.name} vs ${match.awayTeam.name} — ${competitionTitle}`,
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
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
          <nav aria-label="パンくずリスト">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-ink-muted)]">
              <li>
                <Link
                  className="transition-colors hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  href={`/c/${match.competition.family}/${match.competition.season}`}
                >
                  {formatCompetitionTitle(
                    match.competition.name,
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

          <MatchHeader headToHeadHref={headToHeadHref} match={match} />

          <PremiumMatchChat matchId={id} />

          {hasEnglishContent && (
            <div className="flex items-center justify-end">
              <LangToggle currentLang="ja" matchId={match.id} />
            </div>
          )}

          <MatchEventsSection
            awayTeamName={match.awayTeam.name}
            awayTeamSlug={match.awayTeam.slug}
            events={events}
            finalAwayScore={match.awayScore ?? 0}
            finalHomeScore={match.homeScore ?? 0}
            homeTeamId={match.homeTeamId}
            homeTeamName={match.homeTeam.name}
            homeTeamSlug={match.homeTeam.slug}
          />

          <MatchLineupsSection
            awayTeamName={match.awayTeam.name}
            homeTeamId={match.homeTeamId}
            homeTeamName={match.homeTeam.name}
            players={lineups}
          />

          <section className="space-y-4">
            {shouldShowPreviewSection && (
              <MatchContentSection
                content={publishedContent.preview}
                contentType="preview"
                isPremium={true}
                match={match}
                showCta={false}
              />
            )}
            {isFreeSampleRecap ? (
              <>
                <MatchContentSection
                  content={publishedContent.recap}
                  contentType="recap"
                  isPremium={true}
                  match={match}
                />
                <SampleRecapCta matchId={id} />
              </>
            ) : (
              <PremiumRecapSection
                content={publishedContent.recap}
                match={match}
              />
            )}
          </section>
        </div>
      </main>
    </>
  );
}
