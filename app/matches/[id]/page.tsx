import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchChat } from "@/components/match-chat";
import { MatchContentSection } from "@/components/match-content-section";
import { MatchEventsSection } from "@/components/match-events-section";
import { MatchHeader } from "@/components/match-header";
import { MatchLineupsSection } from "@/components/match-lineups-section";
import { getUser, isPremium } from "@/lib/auth/server";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import { getMatchById } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { extractDescription } from "@/lib/match-content/description";

import type { Metadata } from "next";

type MatchDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const revalidate = 60;
export const dynamic = "force-dynamic";

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

  const title = `${match.homeTeam.name} vs ${match.awayTeam.name} — ${formatCompetitionTitle(
    match.competition.name,
    match.competition.season,
  )}`;
  const description = content.preview
    ? extractDescription(content.preview.contentMdJa)
    : `${match.homeTeam.name} vs ${match.awayTeam.name} の試合結果・AI日本語レビュー。`;

  return {
    description,
    openGraph: {
      description,
      title: `${title} | Tryline`,
      type: "article",
      url: `https://tryline-six.vercel.app/matches/${id}`,
    },
    title,
  };
}

export default async function MatchDetailPage({
  params,
}: MatchDetailPageProps) {
  const { id } = await params;
  const [match, publishedContent, events, lineups, user] = await Promise.all([
    getMatchById(id),
    getPublishedContentForMatch(id),
    getMatchEventsForMatch(id),
    getMatchLineupsForMatch(id),
    getUser(),
  ]);

  if (!match) {
    notFound();
  }

  const shouldShowPreviewSection =
    match.status !== "finished" || publishedContent.preview !== null;
  const premium = user ? await isPremium(user.id) : false;
  const jsonLd = {
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
          eventStatus: "https://schema.org/EventScheduled",
          homeTeam: {
            "@type": "SportsTeam",
            name: match.homeTeam.name,
            score: match.homeScore ?? 0,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
          {(() => {
            const slugMatch = match.competition.slug.match(/^(.+)-(\d{4})$/);
            const family = slugMatch?.[1] ?? "";
            const season = slugMatch?.[2] ?? "";
            const seasonHref =
              family && season ? `/c/${family}/${season}` : "/";

            return (
              <nav aria-label="パンくずリスト">
                <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-ink-muted)]">
                  <li>
                    <Link
                      className="transition-colors hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                      href={seasonHref}
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
                        Round {match.round}
                      </li>
                    </>
                  )}
                </ol>
              </nav>
            );
          })()}

          <MatchHeader match={match} />

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
                isPremium={premium}
                match={match}
              />
            )}
            <MatchContentSection
              content={publishedContent.recap}
              contentType="recap"
              isPremium={premium}
              match={match}
            />
          </section>

          <MatchChat isPremium={premium} matchId={id} />
        </div>
      </main>
    </>
  );
}
