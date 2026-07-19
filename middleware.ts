import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (
    !request.cookies
      .getAll()
      .some((cookie) => SUPABASE_AUTH_COOKIE.test(cookie.name))
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // トークンをリフレッシュし、期限切れの場合は Cookie を更新する
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|api/og|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
