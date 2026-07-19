import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";
import type { User } from "@supabase/supabase-js";

export type ClientUserState = {
  favoriteTeamSlugs: string[];
  isPremium: boolean;
  spoilerGuardEnabled: boolean;
  user: User | null;
};

export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function getClientUserState(): Promise<ClientUserState> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const user = session?.user ?? null;

  if (!user) {
    return {
      favoriteTeamSlugs: [],
      isPremium: false,
      spoilerGuardEnabled: false,
      user: null,
    };
  }

  const [profileResult, subscriptionsResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("favorite_team_slugs, premium_until")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("push_subscriptions")
      .select("spoiler_guard")
      .eq("user_id", user.id),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (subscriptionsResult.error) {
    throw subscriptionsResult.error;
  }

  return {
    favoriteTeamSlugs: profileResult.data?.favorite_team_slugs ?? [],
    isPremium:
      profileResult.data?.premium_until != null &&
      new Date(profileResult.data.premium_until).getTime() > Date.now(),
    spoilerGuardEnabled: (subscriptionsResult.data ?? []).some(
      (subscription) => subscription.spoiler_guard,
    ),
    user,
  };
}
