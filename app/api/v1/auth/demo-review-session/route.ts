import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

import {
  apiError,
  apiSuccess,
  PRIVATE_CACHE_CONTROL,
} from "@/lib/api/v1/response";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getPublicEnv } from "@/lib/env";

import type { V1DemoReviewSessionData } from "@/lib/api/v1/types";
import type { Database } from "@/lib/db/types";

type DemoReviewSessionRequest = {
  code?: unknown;
  email?: unknown;
};

function matchesSecret(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function invalidCredentials() {
  return apiError("invalid_credentials", 401, PRIVATE_CACHE_CONTROL);
}

function getDemoReviewCredentials() {
  const email = process.env.APP_REVIEW_DEMO_EMAIL;
  const code = process.env.APP_REVIEW_DEMO_OTP;

  return email && code ? { code, email } : null;
}

export async function POST(request: Request) {
  const credentials = getDemoReviewCredentials();

  if (!credentials) {
    return apiError("not_found", 404, PRIVATE_CACHE_CONTROL);
  }

  let body: DemoReviewSessionRequest;

  try {
    body = (await request.json()) as DemoReviewSessionRequest;
  } catch {
    return invalidCredentials();
  }

  if (typeof body.email !== "string" || typeof body.code !== "string") {
    return invalidCredentials();
  }

  const emailMatches = matchesSecret(
    body.email.toLowerCase(),
    credentials.email.toLowerCase(),
  );
  const codeMatches = matchesSecret(body.code, credentials.code);

  if (!emailMatches || !codeMatches) {
    return invalidCredentials();
  }

  try {
    const serverClient = getSupabaseServerClient();
    const { data: link, error: linkError } =
      await serverClient.auth.admin.generateLink({
        email: credentials.email,
        type: "magiclink",
      });

    if (linkError || !link.properties.hashed_token) {
      return invalidCredentials();
    }

    const { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } =
      getPublicEnv();
    const anonymousClient = createClient<Database>(
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    const { data: sessionData, error: sessionError } =
      await anonymousClient.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "magiclink",
      });

    const session = sessionData.session;

    if (sessionError || !session?.access_token || !session.refresh_token) {
      return invalidCredentials();
    }

    const data: V1DemoReviewSessionData = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };

    return apiSuccess(data, PRIVATE_CACHE_CONTROL);
  } catch {
    return invalidCredentials();
  }
}
