import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchContentSection } from "@/components/match-content-section";
import { MatchEventsSection } from "@/components/match-events-section";
import { MatchHeader } from "@/components/match-header";
import { MatchLineupsSection } from "@/components/match-lineups-section";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { getMatchEventsForMatch } from "@/lib/db/queries/match-events";
import { getMatchLineupsForMatch } from "@/lib/db/queries/match-lineups";
import { getMatchById } from "@/lib/db/queries/matches";
import { extractDescription } from "@/lib/match-content/description";

import type { Metadata } from "next";

type MatchDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const revalidate = 60;

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
      title: "Match Not Found - Tryline",
    };
  }

  const title = `${match.homeTeam.name} vs ${match.awayTeam.name} - Tryline`;

  if (content.preview) {
    return {
      description: extractDescription(content.preview.contentMdJa),
      title,
    };
  }

  return { title };
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

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
        {(() => {
          const slugMatch = match.competition.slug.match(/^(.+)-(\d{4})$/);
          const family = slugMatch?.[1] ?? "";
          const season = slugMatch?.[2] ?? "";
          const seasonHref = family && season ? `/c/${family}/${season}` : "/";

          return (
            <nav aria-label="パンくずリスト">
              <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-ink-muted)]">
                <li>
                  <Link
                    className="transition-colors hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    href={seasonHref}
                  >
                    {match.competition.name} {match.competition.season}
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
          <MatchContentSection
            content={publishedContent.preview}
            contentType="preview"
            match={match}
          />
          <MatchContentSection
            content={publishedContent.recap}
            contentType="recap"
            match={match}
          />
        </section>
      </div>
    </main>
  );
}
