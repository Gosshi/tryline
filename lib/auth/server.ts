import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Database } from "@/lib/db/types";

type PremiumProfile = Pick<
  Database["public"]["Tables"]["user_profiles"]["Row"],
  "premium_until"
>;

export async function getSupabaseServerClientWithAuth() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, options, value }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies; route handlers can.
          }
        },
      },
    },
  );
}

export async function getUser() {
  const supabase = await getSupabaseServerClientWithAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireUser() {
  const user = await getUser();

  if (!user) {
    redirect("/");
  }

  return user;
}

export async function getUserProfile(userId: string) {
  const supabase = await getSupabaseServerClientWithAuth();
  const { data } = await supabase
    .from("user_profiles")
    .select(
      "stripe_customer_id, premium_until, chat_daily_count, chat_daily_reset_date, favorite_team_slugs",
    )
    .eq("id", userId)
    .maybeSingle();

  return data;
}

export function isProfilePremium(
  profile: PremiumProfile | null | undefined,
  now = new Date(),
): boolean {
  return (
    profile?.premium_until != null &&
    new Date(profile.premium_until).getTime() > now.getTime()
  );
}

export async function isPremium(userId: string): Promise<boolean> {
  const profile = await getUserProfile(userId);

  return isProfilePremium(profile);
}
