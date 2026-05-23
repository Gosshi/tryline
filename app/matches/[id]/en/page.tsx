import Link from "next/link";
import { notFound } from "next/navigation";

import { LangToggle } from "@/components/lang-toggle";
import { MatchContentSection } from "@/components/match-content-section";
import { MatchEventsSection } from "@/components/match-events-section";
import { MatchHeader } from "@/components/match-header";
import { MatchLineupsSection } from "@/components/match-lineups-section";
import { PremiumRecapSection } from "@/components/premium-recap-section";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import {
  getMatchById,
  getMatchContentEn,
  listAllMatchIds,
  listMatchIdsWithContent,
} from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatRoundLabel } from "@/lib/format/round-label";
import { extractDescription } from "@/lib/match-content/description";
import { createMatchOgImage } from "@/lib/seo/og-image";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

type MatchEnglishPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  const [matchesWithContent, allMatches] = await Promise.all([
    listMatchIdsWithContent(),
    listAllMatchIds(),
  ]);
  const contentIds = new Set(matchesWithContent.map(({ id }) => id));

  return allMatches
    .filter(
      (match) =>
        contentIds.has(match.id) && match.competitionFamily === "league-one",
    )
    .map(({ id }) => ({ id }));
}

export async function generateMetadata({
  params,
}: MatchEnglishPageProps): Promise<Metadata> {
  const { id } = await params;
  const [match, content] = await Promise.all([
    getMatchById(id),
    getMatchContentEn(id),
  ]);

  if (!match || (!content.preview && !content.recap)) {
    return {
      title: "Match Not Found",
    };
  }

  const competition = formatCompetitionTitle(
    match.competition.name,
    match.competition.season,
  );
  const homeDisplayName = match.homeTeam.englishName ?? match.homeTeam.name;
  const awayDisplayName = match.awayTeam.englishName ?? match.awayTeam.name;
  const title = `${homeDisplayName} vs ${awayDisplayName} — ${competition}`;
  const sourceContent = content.recap ?? content.preview;
  const description = sourceContent
    ? extractDescription(sourceContent.contentMdJa)
    : `${homeDisplayName} vs ${awayDisplayName} rugby match analysis.`;
  const score =
    match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore}–${match.awayScore}`
      : undefined;

  return {
    alternates: {
      canonical: `/matches/${id}/en`,
      languages: {
        en: `/matches/${id}/en`,
        ja: `/matches/${id}`,
      },
    },
    description,
    openGraph: {
      description,
      images: [
        createMatchOgImage({
          away: awayDisplayName,
          competition,
          home: homeDisplayName,
          score,
          status: match.status === "in_progress" ? "live" : match.status,
        }),
      ],
      title,
      type: "article",
      url: `${SITE_URL}/matches/${id}/en`,
    },
    title,
  };
}

export default async function MatchEnglishPage({
  params,
}: MatchEnglishPageProps) {
  const { id } = await params;
  const [match, englishContent, events, lineups] = await Promise.all([
    getMatchById(id),
    getMatchContentEn(id),
    getMatchEventsForMatch(id),
    getMatchLineupsForMatch(id),
  ]);

  if (!match || (!englishContent.preview && !englishContent.recap)) {
    notFound();
  }

  const homeDisplayName = match.homeTeam.englishName ?? match.homeTeam.name;
  const awayDisplayName = match.awayTeam.englishName ?? match.awayTeam.name;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
        <nav aria-label="Breadcrumb">
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

        <MatchHeader
          awayDisplayName={awayDisplayName}
          homeDisplayName={homeDisplayName}
          match={match}
        />

        <div className="flex items-center justify-end">
          <LangToggle currentLang="en" matchId={match.id} />
        </div>

        <MatchEventsSection
          awayTeamName={awayDisplayName}
          awayTeamSlug={match.awayTeam.slug}
          events={events}
          finalAwayScore={match.awayScore ?? 0}
          finalHomeScore={match.homeScore ?? 0}
          homeTeamId={match.homeTeamId}
          homeTeamName={homeDisplayName}
          homeTeamSlug={match.homeTeam.slug}
        />

        <MatchLineupsSection
          awayTeamName={awayDisplayName}
          homeTeamId={match.homeTeamId}
          homeTeamName={homeDisplayName}
          players={lineups}
        />

        <section className="space-y-4">
          {englishContent.preview && (
            <MatchContentSection
              content={englishContent.preview}
              contentType="preview"
              isPremium={true}
              language="en"
              match={match}
              showCta={false}
            />
          )}
          {englishContent.recap && (
            <PremiumRecapSection
              content={englishContent.recap}
              language="en"
              match={match}
            />
          )}
        </section>
      </div>
    </main>
  );
}
