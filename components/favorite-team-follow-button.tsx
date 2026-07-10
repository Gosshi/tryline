"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { trackFavoriteTeamAdded } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type FavoriteTeamFollowButtonProps = {
  className?: string;
  initialFavoriteTeamSlugs: string[];
  source: string;
  teamName: string;
  teamSlug: string;
};

export function FavoriteTeamFollowButton({
  className,
  initialFavoriteTeamSlugs,
  source,
  teamName,
  teamSlug,
}: FavoriteTeamFollowButtonProps) {
  const [favoriteSlugs, setFavoriteSlugs] = useState(initialFavoriteTeamSlugs);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const isFollowing = favoriteSlugs.includes(teamSlug);
  const isAtLimit = !isFollowing && favoriteSlugs.length >= 3;

  async function followTeam() {
    if (isFollowing || isAtLimit || saving) {
      return;
    }

    const nextSlugs = [...favoriteSlugs, teamSlug];
    setSaving(true);

    try {
      const response = await fetch("/api/user/profile", {
        body: JSON.stringify({ favorite_team_slugs: nextSlugs }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Failed to save favorite team");
      }

      setFavoriteSlugs(nextSlugs);
      trackFavoriteTeamAdded({ source, team_slug: teamSlug });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-80",
        className,
      )}
      disabled={isFollowing || isAtLimit || saving}
      onClick={() => void followTeam()}
      type="button"
    >
      {isFollowing
        ? "応援中"
        : isAtLimit
          ? "登録上限です"
          : saving
            ? "保存中..."
            : `${teamName}を追う`}
    </button>
  );
}
