import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/db/server";

const CONFIRMATION_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function redirectToResult(
  request: Request,
  result: string,
  searchParams?: Record<string, string>,
) {
  const url = new URL(`/newsletter/${result}`, request.url);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
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

  if (error) {
    console.error("[newsletter] subscriber confirmation lookup failed", error);
    return redirectToResult(request, "confirmation-error");
  }

  if (!subscriber) {
    return redirectToResult(request, "invalid-link");
  }

  if (subscriber.status === "confirmed") {
    return redirectToResult(request, "already-confirmed");
  }

  if (subscriber.status === "unsubscribed") {
    return redirectToResult(request, "unsubscribed-link");
  }

  if (subscriber.status !== "pending") {
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
    return redirectToResult(request, "confirmation-error");
  }

  return redirectToResult(request, "confirmed", { completed: "1" });
}
