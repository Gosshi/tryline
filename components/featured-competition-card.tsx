import Image from "next/image";

import { TrackedLink } from "@/components/tracked-link";
import { FEATURED_COMPETITION } from "@/lib/featured-competition";

export type FeaturedCompetitionStats = {
  nextMatchLabel: string;
  nextMatchSubLabel: string;
  publishedReviewCount: number;
  weekMatchCount: number;
};

type FeaturedCompetitionCardProps = {
  stats: FeaturedCompetitionStats;
};

export function FeaturedCompetitionCard({
  stats,
}: FeaturedCompetitionCardProps) {
  return (
    <aside className="grid overflow-hidden rounded-[22px] bg-[var(--color-ink)] text-white shadow-sm ring-1 ring-slate-900/10 md:min-h-[236px] md:grid-cols-[minmax(240px,0.78fr)_minmax(0,1.22fr)]">
      <div className="relative min-h-40 overflow-hidden md:min-h-full">
        <Image
          alt=""
          className="object-cover opacity-70"
          fill
          sizes="(min-width: 1024px) 420px, 100vw"
          src="/visuals/pnc.jpg"
        />
        <div className="via-[var(--color-ink)]/25 absolute inset-0 bg-gradient-to-t from-[var(--color-ink)] to-transparent md:bg-gradient-to-r" />
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-5 p-5 sm:p-6 md:p-7">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Featured Competition
          </p>
          <h3 className="mt-2 font-serif text-2xl font-bold leading-tight sm:text-3xl">
            {FEATURED_COMPETITION.headline}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
            {FEATURED_COMPETITION.description}
          </p>
        </div>
        <dl className="grid gap-2 sm:grid-cols-[minmax(0,1.35fr)_minmax(82px,0.55fr)_minmax(82px,0.55fr)]">
          <div className="rounded-xl bg-white/[0.07] px-3 py-2.5">
            <dt className="text-[10px] font-bold text-white/45">次戦</dt>
            <dd className="mt-1 text-sm font-black leading-tight text-white">
              {stats.nextMatchLabel}
            </dd>
            <dd className="mt-1 truncate text-xs font-semibold text-white/55">
              {stats.nextMatchSubLabel}
            </dd>
          </div>
          <div className="rounded-xl bg-white/[0.07] px-3 py-2.5">
            <dt className="text-[10px] font-bold text-white/45">レビュー</dt>
            <dd className="mt-1 text-sm font-black text-white">
              {stats.publishedReviewCount}本
            </dd>
          </div>
          <div className="rounded-xl bg-white/[0.07] px-3 py-2.5">
            <dt className="text-[10px] font-bold text-white/45">今週</dt>
            <dd className="mt-1 text-sm font-black text-white">
              {stats.weekMatchCount}試合
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <TrackedLink
            analytics={{
              cta_id: "home_featured_competition",
              cta_location: "home_week_section",
              destination: "competition",
              label: FEATURED_COMPETITION.headline,
            }}
            className="inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-[var(--color-ink)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href={`/c/${FEATURED_COMPETITION.family}/${FEATURED_COMPETITION.season}`}
          >
            大会ページを見る →
          </TrackedLink>
          <TrackedLink
            analytics={{
              cta_id: "home_focus_calendar",
              cta_location: "home_focus_section",
              destination: "calendar",
              label: "全日程をカレンダーで見る",
            }}
            className="inline-flex text-xs font-bold text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href="/calendar"
          >
            全日程を見る →
          </TrackedLink>
        </div>
      </div>
    </aside>
  );
}
