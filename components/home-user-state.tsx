"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { useUserState } from "@/components/user-state-provider";

import { FavoriteTeamsBanner } from "./favorite-teams-banner";
import { MatchCard } from "./match-card";
import { SpoilerScore } from "./spoiler-score";
import { TrackedLink } from "./tracked-link";

import type { TeamOption } from "./team-picker";
import type { FavoriteTeamMatch } from "@/lib/db/queries/matches";

type HomepageFavoriteTeamsProps = {
  allTeams: TeamOption[];
};

export function HomepageFavoriteTeams({
  allTeams,
}: HomepageFavoriteTeamsProps) {
  const userState = useUserState();
  const [matches, setMatches] = useState<FavoriteTeamMatch[]>([]);

  useEffect(() => {
    if (!userState?.user || userState.favoriteTeamSlugs.length === 0) {
      setMatches([]);
      return;
    }

    const searchParams = new URLSearchParams();
    userState.favoriteTeamSlugs.forEach((team) =>
      searchParams.append("team", team),
    );

    let active = true;

    void fetch(`/api/home/favorite-matches?${searchParams.toString()}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load favorite team matches");
        }

        return (await response.json()) as { matches: FavoriteTeamMatch[] };
      })
      .then(({ matches: nextMatches }) => {
        if (active) {
          setMatches(nextMatches);
        }
      })
      .catch(() => {
        if (active) {
          setMatches([]);
        }
      });

    return () => {
      active = false;
    };
  }, [userState]);

  if (!userState?.user) {
    return null;
  }

  if (userState.favoriteTeamSlugs.length === 0) {
    return <FavoriteTeamsBanner allTeams={allTeams} favoriteTeamSlugs={[]} />;
  }

  if (matches.length === 0) {
    return null;
  }

  const favoriteTeamPageSlug =
    userState.favoriteTeamSlugs.length === 1
      ? (userState.favoriteTeamSlugs[0] ?? null)
      : null;

  return (
    <section
      aria-labelledby="favorite-heading"
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8"
    >
      <div
        className="mb-4 flex items-center justify-between gap-4"
        id="favorite-heading"
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--color-accent)]">
          応援チームの試合
        </h2>
        {favoriteTeamPageSlug && (
          <Link
            className="text-xs text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
            href={`/teams/${favoriteTeamPageSlug}`}
          >
            チームページ →
          </Link>
        )}
      </div>
      <ul className="space-y-3">
        {matches.map((match) => (
          <li key={match.id}>
            <MatchCard match={match} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomepagePremiumCta() {
  const userState = useUserState();

  if (userState?.isPremium) {
    return null;
  }

  return (
    <TrackedLink
      analytics={{
        cta_id: "home_hero_pricing",
        cta_location: "home_hero",
        destination: "pricing",
        label: "Premium無料体験",
      }}
      className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      href="/pricing"
    >
      Premium無料体験
    </TrackedLink>
  );
}

type HomepageSpoilerScoreProps = {
  children: ReactNode;
  className?: string;
};

export function HomepageSpoilerScore({
  children,
  className,
}: HomepageSpoilerScoreProps) {
  const userState = useUserState();

  return (
    <SpoilerScore
      className={className}
      enabled={userState?.spoilerGuardEnabled ?? false}
    >
      {children}
    </SpoilerScore>
  );
}
