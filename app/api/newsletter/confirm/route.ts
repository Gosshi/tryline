import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/db/server";

const CONFIRMATION_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function redirectToResult(request: Request, result: string) {
  return NextResponse.redirect(new URL(`/newsletter/${result}`, request.url));
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return redirectToResult(request, "invalid-link");
  }

  const db = getSupabaseServerClient();
  const { data: subscriber, error } = await db
    .from("email_subscribers")
    .select("id, status, created_at")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (error || !subscriber || subscriber.status !== "pending") {
    return redirectToResult(request, "invalid-link");
  }

  if (
    Date.now() - new Date(subscriber.created_at).getTime() >
    CONFIRMATION_TOKEN_MAX_AGE_MS
  ) {
    return redirectToResult(request, "expired");
  }

  const { error: updateError } = await db
    .from("email_subscribers")
    .update({
      confirmation_token: null,
      confirmed_at: new Date().toISOString(),
      status: "confirmed",
    })
    .eq("id", subscriber.id)
    .eq("confirmation_token", token);

  if (updateError) {
    console.error("[newsletter] subscriber confirmation failed", updateError);

    return redirectToResult(request, "invalid-link");
  }

  return redirectToResult(request, "confirmed");
}
