import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/db/server";

function redirectToResult(request: Request, result: string) {
  return NextResponse.redirect(new URL(`/newsletter/${result}`, request.url));
}

export async function GET(request: Request) {
  const subscriberId = new URL(request.url).searchParams.get("token");
  if (!subscriberId) {
    return redirectToResult(request, "invalid-link");
  }

  const db = getSupabaseServerClient();
  const { data: subscriber, error } = await db
    .from("email_subscribers")
    .select("id")
    .eq("id", subscriberId)
    .maybeSingle();

  if (error || !subscriber) {
    return redirectToResult(request, "invalid-link");
  }

  const { error: updateError } = await db
    .from("email_subscribers")
    .update({
      confirmation_token: null,
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    })
    .eq("id", subscriber.id);

  if (updateError) {
    console.error("[newsletter] unsubscribe failed", updateError);

    return redirectToResult(request, "invalid-link");
  }

  return redirectToResult(request, "unsubscribed");
}
