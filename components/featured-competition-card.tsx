import Image from "next/image";

import { TrackedLink } from "@/components/tracked-link";
import { getCompetitionHeroImage } from "@/lib/competition-hero-images";

export type FeaturedCompetitionStats = {
  nextMatchLabel: string;
  nextMatchSubLabel: string;
  publishedReviewCount: number;
  weekMatchCount: number;
};

type FeaturedCompetitionCardProps = {
  description: string;
  family: string;
  headline: string;
  season: string;
  stats: FeaturedCompetitionStats;
};

export function FeaturedCompetitionCard({
  description,
  family,
  headline,
  season,
  stats,
}: FeaturedCompetitionCardProps) {
  const imageSrc = getCompetitionHeroImage(family);

  return (
    <aside className="tl-featured tl-hover grid overflow-hidden rounded-sm bg-[var(--color-ink-strong)] text-white ring-1 ring-white/10 md:min-h-[236px] md:grid-cols-[minmax(260px,0.82fr)_minmax(0,1.18fr)]">
      <span aria-hidden="true" className="tl-featured-ornament" />
      <div className="tl-featured-photo relative min-h-44 overflow-hidden md:min-h-full">
        <Image
          alt=""
          className="object-cover opacity-70"
          fill
          sizes="(min-width: 1024px) 420px, 100vw"
          src={imageSrc}
        />
        <div className="via-[var(--color-ink-strong)]/25 absolute inset-0 bg-gradient-to-t from-[var(--color-ink-strong)] to-transparent md:bg-gradient-to-r" />
      </div>
      <div className="tl-featured-copy flex min-w-0 flex-col justify-between gap-5 p-5 sm:p-6 md:p-7">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#e0c498]">
            Featured Competition
          </p>
          <h3 className="mt-2 text-balance font-serif text-2xl font-extrabold leading-tight sm:text-3xl">
            {headline}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e2e4e8]">
            {description}
          </p>
        </div>
        <dl className="grid gap-2 sm:grid-cols-[minmax(0,1.35fr)_minmax(82px,0.55fr)_minmax(82px,0.55fr)]">
          <div className="rounded-sm bg-white/[0.07] px-3 py-2.5">
            <dt className="text-[10px] font-bold text-white/80">次戦</dt>
            <dd className="mt-1 text-sm font-black leading-tight text-white">
              {stats.nextMatchLabel}
            </dd>
            <dd className="mt-1 break-words text-xs font-semibold text-white/80">
              {stats.nextMatchSubLabel}
            </dd>
          </div>
          <div className="rounded-sm bg-white/[0.07] px-3 py-2.5">
            <dt className="text-[10px] font-bold text-white/80">レビュー</dt>
            <dd className="mt-1 text-sm font-black text-white">
              {stats.publishedReviewCount}本
            </dd>
          </div>
          <div className="rounded-sm bg-white/[0.07] px-3 py-2.5">
            <dt className="text-[10px] font-bold text-white/80">今週</dt>
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
              label: headline,
            }}
            className="inline-flex min-h-11 items-center rounded-full bg-white px-4 py-2 text-xs font-black text-[var(--color-ink)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href={`/c/${family}/${season}`}
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
            className="inline-flex min-h-11 items-center text-xs font-bold text-white/80 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href="/calendar"
          >
            全日程を見る →
          </TrackedLink>
        </div>
      </div>
    </aside>
  );
}
