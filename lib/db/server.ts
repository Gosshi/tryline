import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

import type { Database } from "@/lib/db/types";

export function getSupabaseServerClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
