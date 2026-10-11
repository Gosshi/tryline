import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/db/types";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  let returnPath = "/";

  if (typeof next === "string" && next.startsWith("/")) {
    try {
      const parsed = new URL(next, origin);
      if (parsed.origin === origin && !parsed.pathname.startsWith("/auth/")) {
        returnPath = parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {
      // Invalid URLs fall back to the home page.
    }
  }

  const redirectUrl = new URL(`${origin}${returnPath}`);
  redirectUrl.searchParams.delete("auth_error");
  redirectUrl.searchParams.delete("signup");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (values) => {
            values.forEach(({ name, options, value }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      },
    );
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const userCreatedAt = data.user?.created_at;
      const isNewSignup = userCreatedAt
        ? Date.now() - new Date(userCreatedAt).getTime() <= 60_000
        : false;

      if (isNewSignup) {
        redirectUrl.searchParams.set("signup", "success");
      }

      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  redirectUrl.searchParams.delete("resume");
  redirectUrl.searchParams.set("auth_error", "1");
  return NextResponse.redirect(redirectUrl.toString());
}
