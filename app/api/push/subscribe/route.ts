import { NextResponse } from "next/server";

import { getSupabaseServerClientWithAuth, getUser } from "@/lib/auth/server";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function POST(request: Request) {
  const user = await getUser();
  const body: unknown = await request.json();

  if (
    !body ||
    typeof body !== "object" ||
    !("endpoint" in body) ||
    !("p256dh" in body) ||
    !("auth_key" in body)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { auth_key, endpoint, p256dh, spoiler_guard, team_slugs } = body as {
    auth_key: unknown;
    endpoint: unknown;
    p256dh: unknown;
    spoiler_guard?: unknown;
    team_slugs?: unknown;
  };

  if (
    typeof auth_key !== "string" ||
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    (spoiler_guard !== undefined && typeof spoiler_guard !== "boolean") ||
    (team_slugs !== undefined && !isStringArray(team_slugs))
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = await getSupabaseServerClientWithAuth();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      auth_key,
      endpoint,
      p256dh,
      spoiler_guard: spoiler_guard ?? false,
      team_slugs: team_slugs ?? [],
      user_id: user?.id ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
