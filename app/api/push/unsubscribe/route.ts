import { NextResponse } from "next/server";

import { getSupabaseServerClientWithAuth } from "@/lib/auth/server";

export async function POST(request: Request) {
  const body: unknown = await request.json();

  if (!body || typeof body !== "object" || !("endpoint" in body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { endpoint } = body as { endpoint: unknown };

  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = await getSupabaseServerClientWithAuth();
  const { error } = await db
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
