import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentPlaceholder } from "@/components/content-placeholder";
import { MatchHeader } from "@/components/match-header";
import { Button } from "@/components/ui/button";
import { getMatchById } from "@/lib/db/queries/matches";

import type { Metadata } from "next";

type MatchDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const revalidate = 60;

export async function generateMetadata({ params }: MatchDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const match = await getMatchById(id);

  if (!match) {
    return {
      title: "Match Not Found - Tryline",
    };
  }

  return {
    title: `${match.homeTeam.name} vs ${match.awayTeam.name} - Tryline`,
  };
}

export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id } = await params;
  const match = await getMatchById(id);

  if (!match) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
        <div>
          <Button asChild variant="outline">
            <Link href="/">一覧に戻る</Link>
          </Button>
        </div>

        <MatchHeader match={match} />

        <section className="space-y-4">
          <ContentPlaceholder type="preview" />
          <ContentPlaceholder type="recap" />
        </section>
      </div>
    </main>
  );
}
