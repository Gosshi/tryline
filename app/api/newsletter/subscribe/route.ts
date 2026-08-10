import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { sendConfirmationEmail } from "@/lib/newsletter";
import { isNewsletterSubscribeRateLimited } from "@/lib/newsletter-rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCES = new Set(["calendar", "competition", "home"]);

function getEmailAndSource(body: unknown): { email: string; source: string } | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const { email, source } = body as { email?: unknown; source?: unknown };
  if (typeof email !== "string" || typeof source !== "string") {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail) || !SOURCES.has(source)) {
    return null;
  }

  return { email: normalizedEmail, source };
}

export async function POST(request: Request) {
  if (isNewsletterSubscribeRateLimited(request)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const input = getEmailAndSource(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const db = getSupabaseServerClient();
  const { data: existing, error: lookupError } = await db
    .from("email_subscribers")
    .select("id, status")
    .eq("email", input.email)
    .maybeSingle();

  if (lookupError) {
    console.error("[newsletter] subscriber lookup failed", lookupError);

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (existing?.status === "confirmed") {
    return NextResponse.json({ ok: true });
  }

  const confirmationToken = randomBytes(32).toString("hex");
  const subscriberId = existing?.id ?? randomUUID();
  const { error: upsertError } = await db.from("email_subscribers").upsert(
    {
      confirmation_token: confirmationToken,
      confirmed_at: null,
      created_at: new Date().toISOString(),
      email: input.email,
      id: subscriberId,
      source: input.source,
      status: "pending",
      unsubscribed_at: null,
    },
    { onConflict: "email" },
  );

  if (upsertError) {
    console.error("[newsletter] subscriber save failed", upsertError);

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  try {
    await sendConfirmationEmail({
      confirmationToken,
      email: input.email,
      subscriberId,
    });
  } catch (error) {
    console.error("[newsletter] confirmation email failed", error);

    return NextResponse.json({ error: "delivery_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
