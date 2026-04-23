import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "@/lib/db/types";

export function getSupabasePublicServerClient() {
  const { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();

  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
