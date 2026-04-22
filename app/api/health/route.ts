import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getPublicEnv, getServerEnv, hasConfiguredValue } from "@/lib/env";
import { getOpenAIClient } from "@/lib/llm/client";

import type { Database } from "@/lib/db/types";

async function checkSupabase(): Promise<"ok" | "error"> {
  const { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } =
    getPublicEnv();

  if (
    !hasConfiguredValue(NEXT_PUBLIC_SUPABASE_URL) ||
    !hasConfiguredValue(NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return "error";
  }

  try {
    const client = createClient<Database>(
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    const { error } = await client.from("competitions").select("*", {
      count: "exact",
      head: true,
    });

    return error ? "error" : "ok";
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
  const [supabase, openai] = await Promise.all([
    checkSupabase(),
    checkOpenAI(),
  ]);

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
