import Image from "next/image";

import { TrackedLink } from "@/components/tracked-link";
import { FEATURED_COMPETITION } from "@/lib/featured-competition";

export type FeaturedCompetitionStats = {
  nextMatchLabel: string;
  publishedReviewCount: number;
  weekMatchCount: number;
};

type FeaturedCompetitionCardProps = {
  stats: FeaturedCompetitionStats;
};

export function FeaturedCompetitionCard({ stats }: FeaturedCompetitionCardProps) {
  return (
    <aside className="overflow-hidden rounded-[20px] bg-[var(--color-ink)] text-white shadow-sm ring-1 ring-slate-900/10">
      <div className="relative h-28 overflow-hidden">
        <Image
          alt=""
          className="object-cover opacity-70"
          fill
          sizes="(min-width: 1024px) 320px, 100vw"
          src="/visuals/pnc.jpg"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-ink)] via-[var(--color-ink)]/30 to-transparent" />
      </div>
      <div className="p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-accent)]">
          Featured Competition
        </p>
        <h3 className="mt-2 font-serif text-2xl font-bold leading-tight">
          {FEATURED_COMPETITION.headline}
        </h3>
        <p className="mt-2 text-sm leading-6 text-white/65">
          {FEATURED_COMPETITION.description}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/[0.07] px-3 py-2">
            <dt className="text-[10px] font-bold text-white/45">次戦</dt>
            <dd className="mt-1 truncate text-xs font-black text-white">
              {stats.nextMatchLabel}
            </dd>
          </div>
          <div className="rounded-xl bg-white/[0.07] px-3 py-2">
            <dt className="text-[10px] font-bold text-white/45">レビュー</dt>
            <dd className="mt-1 text-xs font-black text-white">
              {stats.publishedReviewCount}本
            </dd>
          </div>
          <div className="rounded-xl bg-white/[0.07] px-3 py-2">
            <dt className="text-[10px] font-bold text-white/45">今週</dt>
            <dd className="mt-1 text-xs font-black text-white">
              {stats.weekMatchCount}試合
            </dd>
          </div>
        </dl>
        <TrackedLink
          analytics={{
            cta_id: "home_featured_competition",
            cta_location: "home_week_section",
            destination: "competition",
            label: FEATURED_COMPETITION.headline,
          }}
          className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-[var(--color-ink)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          href={`/c/${FEATURED_COMPETITION.family}/${FEATURED_COMPETITION.season}`}
        >
          大会ページを見る →
        </TrackedLink>
      </div>
    </aside>
  );
}
