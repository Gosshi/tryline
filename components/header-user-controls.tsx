"use client";

import { useEffect, useState } from "react";

import {
  getClientUserState,
  type ClientUserState,
} from "@/lib/auth/client";

import { TrackedLink } from "./tracked-link";
import { UserMenu } from "./user-menu";

import type { TeamOption } from "./team-picker";

const SIGNED_OUT_STATE: ClientUserState = {
  favoriteTeamSlugs: [],
  isPremium: false,
  spoilerGuardEnabled: false,
  user: null,
};

type HeaderUserControlsProps = {
  allTeams: TeamOption[];
};

export function HeaderUserControls({ allTeams }: HeaderUserControlsProps) {
  const [userState, setUserState] =
    useState<ClientUserState>(SIGNED_OUT_STATE);

  useEffect(() => {
    let active = true;

    void getClientUserState()
      .then((state) => {
        if (active) {
          setUserState(state);
        }
      })
      .catch(() => {
        if (active) {
          setUserState(SIGNED_OUT_STATE);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="hidden items-center gap-2 md:flex">
      {!userState.user && (
        <TrackedLink
          analytics={{
            cta_id: "site_header_pricing",
            cta_location: "site_header_desktop",
            destination: "pricing",
            label: "料金",
          }}
          className="-my-1.5 rounded px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0 sm:py-1.5"
          href="/pricing"
        >
          料金
        </TrackedLink>
      )}
      <div className="w-24">
        <UserMenu
          allTeams={allTeams}
          favoriteTeamSlugs={userState.favoriteTeamSlugs}
          initialSpoilerGuard={userState.spoilerGuardEnabled}
          isPremium={userState.isPremium}
          user={userState.user}
        />
      </div>
    </div>
  );
}
