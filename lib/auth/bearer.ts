import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function getBearerAccessToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  return match?.[1] ?? null;
}

export function getSupabaseBearerClient(
  request: Request,
): SupabaseClient<Database> | null {
  const accessToken = getBearerAccessToken(request);

  if (!accessToken) {
    return null;
  }

  const { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } =
    getPublicEnv();

  return createClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
  );
}

export async function getUserFromBearer(
  request: Request,
): Promise<User | null> {
  const accessToken = getBearerAccessToken(request);
  const client = getSupabaseBearerClient(request);

  if (!accessToken || !client) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser(accessToken);

  return error ? null : user;
}
