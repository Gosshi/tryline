import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import {
  getHeadToHeadPageData,
  listHeadToHeadPairs,
  normalizeHeadToHeadSlug,
  parseHeadToHeadSlug,
} from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatKickoffJst } from "@/lib/format/kickoff";
import { SITE_URL } from "@/lib/site";

import type {
  HeadToHeadMatch,
  HeadToHeadPageData,
  HeadToHeadTeam,
} from "@/lib/db/queries/matches";
import type { Metadata } from "next";

type HeadToHeadPageProps = {
  params: Promise<{
    pair: string;
  }>;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  const pairs = await listHeadToHeadPairs();

  return pairs.map((pair) => ({
    pair: pair.slug,
  }));
}

async function resolveHeadToHeadPage(pair: string) {
  const parsed = parseHeadToHeadSlug(pair);

  if (!parsed) {
    return null;
  }

  const canonicalSlug = normalizeHeadToHeadSlug(
    parsed.teamSlugA,
    parsed.teamSlugB,
  );

  if (pair !== canonicalSlug) {
    permanentRedirect(`/h2h/${canonicalSlug}`);
  }

  return getHeadToHeadPageData(parsed.teamSlugA, parsed.teamSlugB);
}

export async function generateMetadata({
  params,
}: HeadToHeadPageProps): Promise<Metadata> {
  const { pair } = await params;
  const data = await resolveHeadToHeadPage(pair);

  if (!data) {
    return {
      title: "H2H Not Found",
    };
  }

  const matchupTitle = `${data.teamA.name} 対 ${data.teamB.name}`;
  const title = `${matchupTitle} 対戦成績`;
  const description = `${data.teamA.name}と${data.teamB.name}の対戦成績（Tryline 収録分）。直近の対戦結果とスコア、日本語レビューへのリンク。`;
  const canonical = `${SITE_URL}/h2h/${data.canonicalSlug}`;

  return {
    alternates: { canonical },
    description,
    openGraph: {
      description,
      locale: "ja_JP",
      title: `${title} | Tryline`,
      type: "website",
      url: canonical,
    },
    title: {
      absolute: `${title} | Tryline`,
    },
  };
}

export default async function HeadToHeadPage({ params }: HeadToHeadPageProps) {
  const { pair } = await params;
  const data = await resolveHeadToHeadPage(pair);

  if (!data) {
    notFound();
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(data);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      <main className="bg-paper min-h-screen">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
          <nav aria-label="パンくずリスト">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-ink-muted)]">
              <li>
                <Link
                  className="transition-colors hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  href="/"
                >
                  Tryline
                </Link>
              </li>
              <li aria-hidden className="select-none">
                /
              </li>
              <li className="text-[var(--color-ink-muted)]">対戦成績</li>
              <li aria-hidden className="select-none">
                /
              </li>
              <li className="text-[var(--color-ink)]">
                {data.teamA.name} 対 {data.teamB.name}
              </li>
            </ol>
          </nav>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
            <div className="grid gap-6 border-b border-slate-100 px-5 py-6 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <TeamSummary align="right" team={data.teamA} />
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Head to Head
                </p>
                <h1 className="mt-2 font-heading text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  {data.teamA.name} 対 {data.teamB.name} 対戦成績
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Tryline収録分の対戦を表示しています。全対戦
                  の通算成績ではありません。
                </p>
              </div>
              <TeamSummary align="left" team={data.teamB} />
            </div>

            <div className="grid gap-3 bg-[#f8fafc]/70 px-5 py-4 sm:grid-cols-3 sm:px-6">
              <Metric label="収録対戦" value={`${data.matches.length}試合`} />
              <Metric
                label="直近の対戦"
                value={formatKickoffJst(data.matches[0]?.kickoffAt ?? "")}
              />
              <Metric label="表示範囲" value="Tryline 収録分" />
            </div>
          </section>

          {data.matches.length < 2 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              このカードは収録対戦データが少ないため、傾向の断定は避けています。
            </p>
          )}

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-slate-950">
              収録対戦リスト
            </h2>
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {data.matches.map((match) => (
                <HeadToHeadMatchRow
                  key={match.id}
                  match={match}
                  teamA={data.teamA}
                  teamB={data.teamB}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <TeamPageLink team={data.teamA} />
            <TeamPageLink team={data.teamB} />
          </div>
        </div>
      </main>
    </>
  );
}

function buildBreadcrumbJsonLd(data: HeadToHeadPageData) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: SITE_URL,
        name: "Tryline",
        position: 1,
      },
      {
        "@type": "ListItem",
        item: `${SITE_URL}/h2h/${data.canonicalSlug}`,
        name: "対戦成績",
        position: 2,
      },
      {
        "@type": "ListItem",
        item: `${SITE_URL}/h2h/${data.canonicalSlug}`,
        name: `${data.teamA.name} 対 ${data.teamB.name}`,
        position: 3,
      },
    ],
  };
}

function TeamSummary({
  align,
  team,
}: {
  align: "left" | "right";
  team: HeadToHeadTeam;
}) {
  return (
    <Link
      className={`group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
        align === "right" ? "justify-end lg:text-right" : "justify-start"
      }`}
      href={`/teams/${team.slug}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-950 text-sm font-black text-white">
        {team.shortCode}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-slate-950 group-hover:underline">
          {team.name}
        </span>
        <span className="block text-xs text-slate-500">チームページへ</span>
      </span>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function HeadToHeadMatchRow({
  match,
  teamA,
  teamB,
}: {
  match: HeadToHeadMatch;
  teamA: HeadToHeadTeam;
  teamB: HeadToHeadTeam;
}) {
  const teamAScore =
    match.homeTeam.slug === teamA.slug ? match.homeScore : match.awayScore;
  const teamBScore =
    match.homeTeam.slug === teamB.slug ? match.homeScore : match.awayScore;
  const scoreText =
    match.status === "finished"
      ? `${teamAScore ?? 0} - ${teamBScore ?? 0}`
      : "試合前";

  return (
    <Link
      className="grid gap-3 px-4 py-4 transition-colors hover:bg-[#f8fafc] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
      href={`/matches/${match.id}`}
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-500">
          {formatCompetitionTitle(match.competition, match.competition.season)}
          {" · "}
          {formatKickoffJst(match.kickoffAt)}
        </span>
        <span className="mt-1 block truncate text-sm font-bold text-slate-950">
          {teamA.name} 対 {teamB.name}
        </span>
      </span>
      <span className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-xs font-semibold text-slate-500">
          {teamA.shortCode}
        </span>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-sm font-black tabular-nums text-white">
          {scoreText}
        </span>
        <span className="text-xs font-semibold text-slate-500">
          {teamB.shortCode}
        </span>
      </span>
    </Link>
  );
}

function TeamPageLink({ team }: { team: HeadToHeadTeam }) {
  return (
    <Link
      className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-950 transition-colors hover:border-slate-300 hover:bg-[#f8fafc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      href={`/teams/${team.slug}`}
    >
      {team.name}のページへ
      <span aria-hidden className="ml-1">
        →
      </span>
    </Link>
  );
}
