import { NextResponse } from "next/server";

import { getPublicEnv, getServerEnv, hasConfiguredValue } from "@/lib/env";
import { getOpenAIClient } from "@/lib/llm/client";

async function checkSupabase(): Promise<"ok" | "error"> {
  const { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();

  if (
    !hasConfiguredValue(NEXT_PUBLIC_SUPABASE_URL) ||
    !hasConfiguredValue(NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return "error";
  }

  try {
    const response = await fetch(new URL("/auth/v1/settings", NEXT_PUBLIC_SUPABASE_URL), {
      headers: {
        apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      next: { revalidate: 0 },
    });

    return response.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkOpenAI(): Promise<"ok" | "error"> {
  const { OPENAI_API_KEY } = getServerEnv();

  if (!hasConfiguredValue(OPENAI_API_KEY)) {
    return "error";
  }

  try {
    const client = getOpenAIClient();
    await client.models.list();

    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  const [supabase, openai] = await Promise.all([checkSupabase(), checkOpenAI()]);

  return NextResponse.json({
    status: "ok",
    checks: {
      supabase,
      openai,
    },
    version:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      process.env.npm_package_version ??
      "dev",
    timestamp: new Date().toISOString(),
  });
}
